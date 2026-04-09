/**
 * Memory 规则评估器
 * 按优先级顺序匹配审批人配置的结构化规则
 */

import { db } from '@/lib/db';
import { autoApprovalRules } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';

export interface RuleConditions {
  maxAmountUSD?: number;
  allowedCategories?: string[];
  blockedCategories?: string[];
  allowedEmployeeIds?: string[];
  allowedDepartmentIds?: string[];
  requirePolicyPassed?: boolean;      // 默认 true（风控已检查，此处可跳过）
  requireReceiptsAttached?: boolean;  // 默认 true
}

export interface EvaluationInput {
  profileId: string;
  amountUSD: number;
  categories: string[];               // 报销明细类别列表
  submitterUserId: string;
  submitterDepartmentId: string | null;
  hasReceipts: boolean;
}

export interface EvaluationResult {
  matched: boolean;
  action?: 'approve' | 'skip';
  ruleId?: string;
  ruleName?: string;
}

/**
 * 按优先级逐条匹配规则，返回第一个命中的规则
 */
export async function evaluateMemoryRules(input: EvaluationInput): Promise<EvaluationResult> {
  const rules = await db
    .select()
    .from(autoApprovalRules)
    .where(
      and(
        eq(autoApprovalRules.profileId, input.profileId),
        eq(autoApprovalRules.isActive, true)
      )
    )
    .orderBy(asc(autoApprovalRules.priority));

  for (const rule of rules) {
    const conditions = rule.conditions as RuleConditions;

    if (matchesRule(conditions, input)) {
      return {
        matched: true,
        action: (rule.action as 'approve' | 'skip') ?? 'approve',
        ruleId: rule.id,
        ruleName: rule.name,
      };
    }
  }

  return { matched: false };
}

function matchesRule(conditions: RuleConditions, input: EvaluationInput): boolean {
  // 金额上限
  if (conditions.maxAmountUSD !== undefined && input.amountUSD > conditions.maxAmountUSD) {
    return false;
  }

  // 允许类别（whitelist：必须全部在列表中）
  if (conditions.allowedCategories && conditions.allowedCategories.length > 0) {
    const allowed = new Set(conditions.allowedCategories);
    if (!input.categories.every(c => allowed.has(c))) {
      return false;
    }
  }

  // 禁止类别（blacklist：不能有任何命中）
  if (conditions.blockedCategories && conditions.blockedCategories.length > 0) {
    const blocked = new Set(conditions.blockedCategories);
    if (input.categories.some(c => blocked.has(c))) {
      return false;
    }
  }

  // 员工白名单
  if (conditions.allowedEmployeeIds && conditions.allowedEmployeeIds.length > 0) {
    if (!conditions.allowedEmployeeIds.includes(input.submitterUserId)) {
      return false;
    }
  }

  // 部门白名单
  if (conditions.allowedDepartmentIds && conditions.allowedDepartmentIds.length > 0) {
    if (!input.submitterDepartmentId ||
        !conditions.allowedDepartmentIds.includes(input.submitterDepartmentId)) {
      return false;
    }
  }

  // 票据要求（默认 true）
  const requireReceipts = conditions.requireReceiptsAttached !== false;
  if (requireReceipts && !input.hasReceipts) {
    return false;
  }

  return true;
}
