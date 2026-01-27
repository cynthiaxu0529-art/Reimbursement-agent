/**
 * 审批链服务
 * 负责根据审批规则为报销单生成审批链
 */

import { db } from '@/lib/db';
import { approvalChain, approvalRules, departments, users, reimbursements } from '@/lib/db/schema';
import { eq, and, asc, desc } from 'drizzle-orm';
import type { ApprovalRuleStep, ApprovalStepTypeValue } from '@/types';

interface GenerateChainParams {
  reimbursementId: string;
  userId: string;
  tenantId: string;
  totalAmount: number;
  categories?: string[];
}

interface ChainStep {
  stepOrder: number;
  stepType: string;
  stepName: string;
  approverId: string | null;
  approverRole: string | null;
  departmentId: string | null;
  amountThreshold: number | null;
}

/**
 * 生成审批链
 */
export async function generateApprovalChain(params: GenerateChainParams): Promise<ChainStep[]> {
  const { reimbursementId, userId, tenantId, totalAmount, categories } = params;

  // 1. 获取用户信息（包括部门和直属上级）
  const submitter = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!submitter) {
    throw new Error('未找到提交人信息');
  }

  // 2. 查找匹配的审批规则
  const rule = await findMatchingRule(tenantId, totalAmount, categories, submitter.departmentId);

  // 3. 根据规则生成审批步骤
  const steps = await buildApprovalSteps(rule, submitter, tenantId, totalAmount);

  // 4. 去重（同一人不需要审批两次）并过滤自己
  const uniqueSteps = deduplicateSteps(steps, userId);

  // 5. 保存审批链到数据库
  if (uniqueSteps.length > 0) {
    await db.insert(approvalChain).values(
      uniqueSteps.map((step, index) => ({
        reimbursementId,
        stepOrder: index + 1,
        stepType: step.stepType,
        stepName: step.stepName,
        approverId: step.approverId,
        approverRole: step.approverRole,
        departmentId: step.departmentId,
        amountThreshold: step.amountThreshold,
        status: index === 0 ? 'pending' as const : 'pending' as const, // 第一个步骤设为待审批
      }))
    );
  }

  return uniqueSteps;
}

/**
 * 查找匹配的审批规则
 */
async function findMatchingRule(
  tenantId: string,
  amount: number,
  categories?: string[],
  departmentId?: string | null
) {
  // 获取所有激活的规则，按优先级排序
  const rules = await db.query.approvalRules.findMany({
    where: and(
      eq(approvalRules.tenantId, tenantId),
      eq(approvalRules.isActive, true)
    ),
    orderBy: [asc(approvalRules.priority)],
  });

  // 遍历规则，找到第一个匹配的
  for (const rule of rules) {
    const conditions = rule.conditions as {
      minAmount?: number;
      maxAmount?: number;
      categories?: string[];
      departments?: string[];
    };

    // 检查金额条件
    if (conditions.minAmount !== undefined && amount < conditions.minAmount) {
      continue;
    }
    if (conditions.maxAmount !== undefined && amount > conditions.maxAmount) {
      continue;
    }

    // 检查类别条件
    if (conditions.categories?.length && categories?.length) {
      const hasMatchingCategory = categories.some(c => conditions.categories!.includes(c));
      if (!hasMatchingCategory) {
        continue;
      }
    }

    // 检查部门条件
    if (conditions.departments?.length && departmentId) {
      if (!conditions.departments.includes(departmentId)) {
        continue;
      }
    }

    // 找到匹配的规则
    return rule;
  }

  // 如果没有匹配的规则，返回默认规则
  const defaultRule = await db.query.approvalRules.findFirst({
    where: and(
      eq(approvalRules.tenantId, tenantId),
      eq(approvalRules.isDefault, true),
      eq(approvalRules.isActive, true)
    ),
  });

  return defaultRule;
}

/**
 * 根据规则构建审批步骤
 */
async function buildApprovalSteps(
  rule: typeof approvalRules.$inferSelect | null | undefined,
  submitter: typeof users.$inferSelect,
  tenantId: string,
  amount: number
): Promise<ChainStep[]> {
  const steps: ChainStep[] = [];

  // 如果没有规则，使用默认流程：直属上级 -> 财务
  if (!rule) {
    return buildDefaultSteps(submitter, tenantId);
  }

  const ruleSteps = rule.approvalSteps as ApprovalRuleStep[];

  for (const ruleStep of ruleSteps) {
    const step = await resolveStep(ruleStep, submitter, tenantId, amount);
    if (step) {
      steps.push(step);
    }
  }

  return steps;
}

/**
 * 构建默认审批步骤
 */
async function buildDefaultSteps(
  submitter: typeof users.$inferSelect,
  tenantId: string
): Promise<ChainStep[]> {
  const steps: ChainStep[] = [];
  let stepOrder = 1;

  // 1. 直属上级审批
  if (submitter.managerId) {
    steps.push({
      stepOrder: stepOrder++,
      stepType: 'manager',
      stepName: '直属上级审批',
      approverId: submitter.managerId,
      approverRole: null,
      departmentId: null,
      amountThreshold: null,
    });
  }

  // 2. 部门负责人审批
  if (submitter.departmentId) {
    const dept = await db.query.departments.findFirst({
      where: eq(departments.id, submitter.departmentId),
    });

    if (dept?.managerId && dept.managerId !== submitter.managerId) {
      steps.push({
        stepOrder: stepOrder++,
        stepType: 'department',
        stepName: `${dept.name}负责人审批`,
        approverId: dept.managerId,
        approverRole: null,
        departmentId: dept.id,
        amountThreshold: null,
      });
    }
  }

  // 3. 财务审核
  const financeUsers = await db.query.users.findMany({
    where: and(
      eq(users.tenantId, tenantId),
      eq(users.role, 'finance')
    ),
  });

  if (financeUsers.length > 0) {
    // 选择第一个财务人员作为审批人，后续可以优化为按工作量分配
    steps.push({
      stepOrder: stepOrder++,
      stepType: 'role',
      stepName: '财务审核',
      approverId: financeUsers[0].id,
      approverRole: 'finance',
      departmentId: null,
      amountThreshold: null,
    });
  }

  return steps;
}

/**
 * 解析单个审批步骤
 */
async function resolveStep(
  ruleStep: ApprovalRuleStep,
  submitter: typeof users.$inferSelect,
  tenantId: string,
  amount: number
): Promise<ChainStep | null> {
  switch (ruleStep.type as ApprovalStepTypeValue) {
    case 'manager': {
      // 直属上级
      if (!submitter.managerId) return null;
      return {
        stepOrder: ruleStep.order,
        stepType: 'manager',
        stepName: ruleStep.name || '直属上级审批',
        approverId: submitter.managerId,
        approverRole: null,
        departmentId: null,
        amountThreshold: null,
      };
    }

    case 'department': {
      // 部门负责人
      if (!submitter.departmentId) return null;
      const dept = await db.query.departments.findFirst({
        where: eq(departments.id, submitter.departmentId),
      });
      if (!dept?.managerId) return null;
      return {
        stepOrder: ruleStep.order,
        stepType: 'department',
        stepName: ruleStep.name || `${dept.name}负责人审批`,
        approverId: dept.managerId,
        approverRole: null,
        departmentId: dept.id,
        amountThreshold: null,
      };
    }

    case 'parent_department': {
      // 上级部门负责人
      if (!submitter.departmentId) return null;
      const dept = await db.query.departments.findFirst({
        where: eq(departments.id, submitter.departmentId),
      });
      if (!dept?.parentId) return null;
      const parentDept = await db.query.departments.findFirst({
        where: eq(departments.id, dept.parentId),
      });
      if (!parentDept?.managerId) return null;
      return {
        stepOrder: ruleStep.order,
        stepType: 'parent_department',
        stepName: ruleStep.name || `${parentDept.name}负责人审批`,
        approverId: parentDept.managerId,
        approverRole: null,
        departmentId: parentDept.id,
        amountThreshold: null,
      };
    }

    case 'role': {
      // 指定角色
      if (!ruleStep.role) return null;
      const roleUsers = await db.query.users.findMany({
        where: and(
          eq(users.tenantId, tenantId),
          eq(users.role, ruleStep.role as typeof users.role.enumValues[number])
        ),
      });
      if (roleUsers.length === 0) return null;
      return {
        stepOrder: ruleStep.order,
        stepType: 'role',
        stepName: ruleStep.name || `${ruleStep.role}审批`,
        approverId: roleUsers[0].id,
        approverRole: ruleStep.role,
        departmentId: null,
        amountThreshold: null,
      };
    }

    case 'amount_threshold': {
      // 金额阈值触发
      const threshold = ruleStep.amountThreshold ?? 0;
      if (amount < threshold) return null;
      // 查找高级别审批人（如总经理）
      const adminUsers = await db.query.users.findMany({
        where: and(
          eq(users.tenantId, tenantId),
          eq(users.role, 'admin')
        ),
      });
      if (adminUsers.length === 0) return null;
      return {
        stepOrder: ruleStep.order,
        stepType: 'amount_threshold',
        stepName: ruleStep.name || `金额超过${threshold}需额外审批`,
        approverId: adminUsers[0].id,
        approverRole: 'admin',
        departmentId: null,
        amountThreshold: threshold,
      };
    }

    case 'specific_user': {
      // 指定审批人
      if (!ruleStep.userId) return null;
      return {
        stepOrder: ruleStep.order,
        stepType: 'specific_user',
        stepName: ruleStep.name || '指定审批人',
        approverId: ruleStep.userId,
        approverRole: null,
        departmentId: null,
        amountThreshold: null,
      };
    }

    default:
      return null;
  }
}

/**
 * 去除重复的审批步骤（同一人不需要审批两次）
 */
function deduplicateSteps(steps: ChainStep[], submitterId: string): ChainStep[] {
  const seen = new Set<string>();
  const result: ChainStep[] = [];

  for (const step of steps) {
    // 跳过提交人自己
    if (step.approverId === submitterId) continue;

    // 跳过已经出现过的审批人
    if (step.approverId && seen.has(step.approverId)) continue;

    if (step.approverId) {
      seen.add(step.approverId);
    }

    result.push({
      ...step,
      stepOrder: result.length + 1,
    });
  }

  return result;
}

/**
 * 获取报销单的审批链
 */
export async function getApprovalChain(reimbursementId: string) {
  const chain = await db.query.approvalChain.findMany({
    where: eq(approvalChain.reimbursementId, reimbursementId),
    orderBy: [asc(approvalChain.stepOrder)],
  });

  // 获取审批人信息
  const approverIds = chain.map(s => s.approverId).filter(Boolean) as string[];
  const approvers: Record<string, { id: string; name: string; email: string; avatar?: string | null }> = {};

  if (approverIds.length > 0) {
    const approverUsers = await db.query.users.findMany({
      where: eq(users.id, approverIds[0]), // 简化查询
      columns: { id: true, name: true, email: true, avatar: true },
    });

    for (const u of approverUsers) {
      approvers[u.id] = u;
    }
  }

  return chain.map(step => ({
    ...step,
    approver: step.approverId ? approvers[step.approverId] : null,
  }));
}

/**
 * 获取当前待审批步骤
 */
export async function getCurrentPendingStep(reimbursementId: string) {
  return db.query.approvalChain.findFirst({
    where: and(
      eq(approvalChain.reimbursementId, reimbursementId),
      eq(approvalChain.status, 'pending')
    ),
    orderBy: [asc(approvalChain.stepOrder)],
  });
}

/**
 * 处理审批操作
 */
export async function processApprovalAction(
  reimbursementId: string,
  approverId: string,
  action: 'approve' | 'reject',
  comment?: string
) {
  // 1. 获取当前待审批步骤
  const currentStep = await getCurrentPendingStep(reimbursementId);

  if (!currentStep) {
    throw new Error('没有待审批的步骤');
  }

  // 2. 检查是否是当前步骤的审批人
  if (currentStep.approverId !== approverId) {
    // 检查是否有角色匹配权限（如财务角色）
    if (currentStep.approverRole) {
      const approver = await db.query.users.findFirst({
        where: eq(users.id, approverId),
      });
      if (approver?.role !== currentStep.approverRole) {
        throw new Error('您不是当前步骤的审批人');
      }
    } else {
      throw new Error('您不是当前步骤的审批人');
    }
  }

  // 3. 更新当前步骤状态
  await db
    .update(approvalChain)
    .set({
      status: action === 'approve' ? 'approved' : 'rejected',
      comment,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(approvalChain.id, currentStep.id));

  // 4. 如果拒绝，整个审批流程结束
  if (action === 'reject') {
    // 更新报销单状态为拒绝
    await db
      .update(reimbursements)
      .set({
        status: 'rejected',
        rejectedAt: new Date(),
        rejectedBy: approverId,
        rejectReason: comment,
        updatedAt: new Date(),
      })
      .where(eq(reimbursements.id, reimbursementId));

    return { completed: true, approved: false };
  }

  // 5. 如果通过，检查是否还有下一步
  const nextStep = await db.query.approvalChain.findFirst({
    where: and(
      eq(approvalChain.reimbursementId, reimbursementId),
      eq(approvalChain.status, 'pending')
    ),
    orderBy: [asc(approvalChain.stepOrder)],
  });

  if (nextStep) {
    // 还有下一步，等待下一级审批
    return { completed: false, approved: true, nextStep };
  }

  // 6. 所有步骤都通过，审批完成
  await db
    .update(reimbursements)
    .set({
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: approverId,
      updatedAt: new Date(),
    })
    .where(eq(reimbursements.id, reimbursementId));

  return { completed: true, approved: true };
}

/**
 * 检查用户是否有权限审批某个报销单
 */
export async function canUserApprove(reimbursementId: string, userId: string): Promise<boolean> {
  const currentStep = await getCurrentPendingStep(reimbursementId);

  if (!currentStep) {
    return false;
  }

  // 直接匹配审批人
  if (currentStep.approverId === userId) {
    return true;
  }

  // 检查角色匹配
  if (currentStep.approverRole) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (user?.role === currentStep.approverRole) {
      return true;
    }
  }

  return false;
}
