/**
 * Skill 执行 API
 * 提供预算预警、异常消费检测、时效性分析等功能
 *
 * 支持两种认证方式：
 * 1. Session 认证（正常用户访问）
 * 2. 内部认证（AI工具调用，通过 context.userId/tenantId）
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, reimbursements, reimbursementItems, policies } from '@/lib/db/schema';
import { eq, and, gte, lte, inArray, sql, desc } from 'drizzle-orm';
import {
  createSkillManager,
  createBudgetAlertSkill,
  createAnomalyDetectorSkill,
  createTimelinessAnalysisSkill,
  getBuiltInSkills,
} from '@/lib/skills/skill-manager';
import { SkillTrigger } from '@/types';
import { getUserRoles, isAdmin, canApprove, canProcessPayment } from '@/lib/auth/roles';
import { getVisibleUserIds } from '@/lib/department/department-service';

// 所有费用类别（用于全面分析）
const ALL_CATEGORIES = [
  'flight',
  'train',
  'hotel',
  'meal',
  'taxi',
  'office_supplies',
  'ai_token',
  'cloud_resource',
  'api_service',
  'software',
  'hosting',
  'domain',
  'client_entertainment',
  'other',
];

// 技术费用类别（用于预算预警）
const TECH_CATEGORIES = [
  'ai_token',
  'cloud_resource',
  'api_service',
  'software',
  'hosting',
  'domain',
];

/**
 * POST /api/skills/execute
 * 执行指定的 Skill
 *
 * Body:
 * - skillId: string - 要执行的 Skill ID
 * - params?: object - 额外参数
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { skillId, params = {}, context: bodyContext } = body;

    // 支持两种认证方式
    let user: any;
    let userId: string;

    // 检查是否是内部调用（来自 AI 工具执行器）
    const internalUserId = bodyContext?.userId;
    const internalTenantId = bodyContext?.tenantId;

    if (internalUserId && internalTenantId) {
      // 内部调用认证
      user = await db.query.users.findFirst({
        where: eq(users.id, internalUserId),
      });

      if (!user || user.tenantId !== internalTenantId) {
        return NextResponse.json({ error: '内部认证失败' }, { status: 403 });
      }

      userId = internalUserId;
      console.log('[Skills API] Internal auth:', { userId, tenantId: internalTenantId });
    } else {
      // 正常的 session 认证
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: '未登录' }, { status: 401 });
      }

      user = await db.query.users.findFirst({
        where: eq(users.id, session.user.id),
      });

      if (!user?.tenantId) {
        return NextResponse.json({ error: '未关联公司' }, { status: 404 });
      }

      userId = session.user.id;
    }

    if (!skillId) {
      return NextResponse.json({ error: '缺少 skillId 参数' }, { status: 400 });
    }

    // 获取用户角色和权限
    const userRoles = getUserRoles(user);
    const scope = params.scope || 'company';

    // 根据权限获取可见用户列表
    let visibleUserIds: string[] | null = null;
    if (scope === 'personal') {
      visibleUserIds = [userId];
    } else if (scope === 'team' || scope === 'company') {
      if (!isAdmin(userRoles) && !canApprove(userRoles) && !canProcessPayment(userRoles)) {
        visibleUserIds = [userId];
      } else {
        visibleUserIds = await getVisibleUserIds(userId, user.tenantId, userRoles);
      }
    }

    // 获取当月日期范围
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // 获取上月日期范围（用于异常检测对比）
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // 构建基础查询条件
    const baseConditions: any[] = [
      eq(reimbursements.tenantId, user.tenantId),
      inArray(reimbursements.status, ['approved', 'paid', 'pending', 'under_review']),
    ];

    // 添加权限过滤
    if (visibleUserIds !== null && visibleUserIds.length > 0) {
      baseConditions.push(inArray(reimbursements.userId, visibleUserIds));
    } else if (visibleUserIds !== null && visibleUserIds.length === 0) {
      baseConditions.push(eq(reimbursements.userId, userId));
    }

    // 查询当月技术费用（用于预算预警和异常检测）
    const currentMonthTechExpenses = await db
      .select({
        id: reimbursementItems.id,
        category: reimbursementItems.category,
        amount: reimbursementItems.amountInBaseCurrency,
        vendor: reimbursementItems.vendor,
        date: reimbursementItems.date,
      })
      .from(reimbursementItems)
      .innerJoin(reimbursements, eq(reimbursementItems.reimbursementId, reimbursements.id))
      .where(and(
        ...baseConditions,
        gte(reimbursementItems.date, startOfMonth),
        lte(reimbursementItems.date, endOfMonth),
        inArray(reimbursementItems.category, TECH_CATEGORIES),
      ));

    // 查询当月所有费用（用于时效性分析）
    const currentMonthAllExpenses = await db
      .select({
        id: reimbursementItems.id,
        category: reimbursementItems.category,
        amount: reimbursementItems.amountInBaseCurrency,
        vendor: reimbursementItems.vendor,
        date: reimbursementItems.date,
        reimbursementId: reimbursementItems.reimbursementId,
      })
      .from(reimbursementItems)
      .innerJoin(reimbursements, eq(reimbursementItems.reimbursementId, reimbursements.id))
      .where(and(
        ...baseConditions,
        gte(reimbursementItems.date, startOfMonth),
        lte(reimbursementItems.date, endOfMonth),
      ));

    // 获取报销单的提交日期（用于时效性分析）
    const reimbursementIds = [...new Set(currentMonthAllExpenses.map(e => e.reimbursementId))];
    let reimbursementSubmitDates = new Map<string, Date>();
    if (reimbursementIds.length > 0) {
      const reimbursementData = await db
        .select({
          id: reimbursements.id,
          submittedAt: reimbursements.submittedAt,
          createdAt: reimbursements.createdAt,
        })
        .from(reimbursements)
        .where(inArray(reimbursements.id, reimbursementIds));
      for (const r of reimbursementData) {
        reimbursementSubmitDates.set(r.id, r.submittedAt || r.createdAt);
      }
    }

    // 查询上月技术费用总额
    const lastMonthResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(${reimbursementItems.amountInBaseCurrency}), 0)`,
      })
      .from(reimbursementItems)
      .innerJoin(reimbursements, eq(reimbursementItems.reimbursementId, reimbursements.id))
      .where(and(
        eq(reimbursements.tenantId, user.tenantId),
        gte(reimbursementItems.date, startOfLastMonth),
        lte(reimbursementItems.date, endOfLastMonth),
        inArray(reimbursementItems.category, TECH_CATEGORIES),
        inArray(reimbursements.status, ['approved', 'paid']),
        // 同样应用权限过滤
        ...(visibleUserIds !== null && visibleUserIds.length > 0
          ? [inArray(reimbursements.userId, visibleUserIds)]
          : []),
      ));

    const lastMonthTotal = Number(lastMonthResult[0]?.total) || 0;

    // 按类别汇总当月技术费用
    const monthlyExpenses: Record<string, number> = {};
    for (const expense of currentMonthTechExpenses) {
      monthlyExpenses[expense.category] = (monthlyExpenses[expense.category] || 0) + expense.amount;
    }

    // 获取政策中的预算限额
    const policyList = await db.query.policies.findMany({
      where: eq(policies.tenantId, user.tenantId),
    });

    // 从政策中提取预算限额
    const budgetLimits: Record<string, number> = {
      ai_token: 5000,
      cloud_resource: 10000,
      software: 3000,
      total_tech: 20000,
    };

    for (const policy of policyList) {
      if (policy.rules && Array.isArray(policy.rules)) {
        for (const rule of policy.rules as any[]) {
          if (rule.limit?.type === 'per_month' && rule.categories) {
            for (const cat of rule.categories) {
              if (TECH_CATEGORIES.includes(cat)) {
                budgetLimits[cat] = rule.limit.amount;
              }
            }
          }
        }
      }
    }

    // 计算历史平均值（用于异常检测）
    const historicalAvg: Record<string, { avgAmount: number; stdDev: number }> = {};
    for (const cat of TECH_CATEGORIES) {
      const monthlyAvg = lastMonthTotal / TECH_CATEGORIES.length;
      historicalAvg[cat] = {
        avgAmount: monthlyAvg / 10,
        stdDev: monthlyAvg / 20,
      };
    }

    // 准备时效性分析数据
    const timelinessExpenses = currentMonthAllExpenses.map(e => ({
      ...e,
      submittedAt: reimbursementSubmitDates.get(e.reimbursementId) || now,
    }));

    // 创建执行上下文
    const context = {
      trigger: SkillTrigger.ON_CHAT_COMMAND,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      tenant: {
        id: user.tenantId,
        name: '',
        settings: {},
      },
      params: {
        ...params,
        monthlyExpenses,
        budgetLimits,
        currentExpenses: currentMonthTechExpenses,
        historicalAvg,
        lastMonthTotal,
        // 时效性分析数据
        expenses: timelinessExpenses,
      },
      reimbursement: {
        submittedAt: now, // 用于时效性分析计算
      },
    };

    let result;

    // 根据 skillId 执行对应的 Skill
    if (skillId === 'builtin_budget_alert') {
      const skill = createBudgetAlertSkill(user.tenantId);
      const manager = createSkillManager(user.tenantId, [skill]);
      const results = await manager.executeTrigger(SkillTrigger.ON_CHAT_COMMAND, context as any);
      result = results.get('builtin_budget_alert');
    } else if (skillId === 'builtin_anomaly_detector') {
      const skill = createAnomalyDetectorSkill(user.tenantId);
      const manager = createSkillManager(user.tenantId, [skill]);
      const results = await manager.executeTrigger(SkillTrigger.ON_CHAT_COMMAND, context as any);
      result = results.get('builtin_anomaly_detector');
    } else if (skillId === 'builtin_timeliness_analysis') {
      // 时效性分析 Skill
      const skill = createTimelinessAnalysisSkill(user.tenantId);
      const manager = createSkillManager(user.tenantId, [skill]);
      const results = await manager.executeTrigger(SkillTrigger.ON_CHAT_COMMAND, context as any);
      result = results.get('builtin_timeliness_analysis');
    } else if (skillId === 'all_tech_analysis') {
      // 执行所有技术费用分析 Skill
      const budgetSkill = createBudgetAlertSkill(user.tenantId);
      const anomalySkill = createAnomalyDetectorSkill(user.tenantId);
      const manager = createSkillManager(user.tenantId, [budgetSkill, anomalySkill]);
      const results = await manager.executeTrigger(SkillTrigger.ON_CHAT_COMMAND, context as any);

      result = {
        success: true,
        data: {
          budgetAlert: results.get('builtin_budget_alert'),
          anomalyDetection: results.get('builtin_anomaly_detector'),
          summary: {
            currentMonthTotal: Object.values(monthlyExpenses).reduce((a, b) => a + b, 0),
            lastMonthTotal,
            expenseCount: currentMonthTechExpenses.length,
            period: {
              start: startOfMonth.toISOString(),
              end: endOfMonth.toISOString(),
            },
          },
        },
      };

      return NextResponse.json(result);
    } else if (skillId === 'all_analysis') {
      // 执行所有分析 Skill（包括时效性）
      const budgetSkill = createBudgetAlertSkill(user.tenantId);
      const anomalySkill = createAnomalyDetectorSkill(user.tenantId);
      const timelinessSkill = createTimelinessAnalysisSkill(user.tenantId);
      const manager = createSkillManager(user.tenantId, [budgetSkill, anomalySkill, timelinessSkill]);
      const results = await manager.executeTrigger(SkillTrigger.ON_CHAT_COMMAND, context as any);

      result = {
        success: true,
        data: {
          budgetAlert: results.get('builtin_budget_alert'),
          anomalyDetection: results.get('builtin_anomaly_detector'),
          timeliness: results.get('builtin_timeliness_analysis'),
          summary: {
            currentMonthTotal: Object.values(monthlyExpenses).reduce((a, b) => a + b, 0),
            lastMonthTotal,
            techExpenseCount: currentMonthTechExpenses.length,
            totalExpenseCount: currentMonthAllExpenses.length,
            period: {
              start: startOfMonth.toISOString(),
              end: endOfMonth.toISOString(),
            },
          },
        },
      };

      return NextResponse.json(result);
    } else {
      return NextResponse.json({ error: '未知的 Skill ID' }, { status: 400 });
    }

    return NextResponse.json({
      success: result?.success ?? false,
      data: result?.data,
      error: result?.error,
      executionTime: result?.executionTime,
    });
  } catch (error) {
    console.error('Skill execution error:', error);
    return NextResponse.json({ error: '执行 Skill 失败' }, { status: 500 });
  }
}

/**
 * GET /api/skills/execute
 * 获取可用的 Skill 列表
 *
 * 动态返回所有内置 Skills 和自定义 Skills
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '未关联公司' }, { status: 404 });
    }

    // 获取内置 Skills
    const builtInSkills = getBuiltInSkills(user.tenantId);

    // 格式化为 API 响应格式
    const skillList = builtInSkills
      .filter(skill => skill.isActive)
      .map(skill => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        category: skill.category,
        isBuiltIn: skill.isBuiltIn,
        triggers: skill.triggers.map(t => t.type),
        inputSchema: skill.inputSchema,
        outputSchema: skill.outputSchema,
      }));

    // 添加聚合分析选项
    skillList.push(
      {
        id: 'all_tech_analysis',
        name: '技术费用综合分析',
        description: '执行所有技术费用相关的分析（预算预警 + 异常检测）',
        category: 'analysis' as any,
        isBuiltIn: true,
        triggers: ['on_chat_command'],
        inputSchema: undefined,
        outputSchema: undefined,
      },
      {
        id: 'all_analysis',
        name: '全面费用分析',
        description: '执行所有费用分析（预算预警 + 异常检测 + 时效性分析）',
        category: 'analysis' as any,
        isBuiltIn: true,
        triggers: ['on_chat_command'],
        inputSchema: undefined,
        outputSchema: undefined,
      }
    );

    return NextResponse.json({
      success: true,
      data: skillList,
    });
  } catch (error) {
    console.error('Get skills error:', error);
    return NextResponse.json({ error: '获取 Skill 列表失败' }, { status: 500 });
  }
}
