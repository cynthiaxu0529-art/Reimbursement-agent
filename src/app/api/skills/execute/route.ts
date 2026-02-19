/**
 * Skill 执行 API
 * 提供预算预警和异常消费检测功能
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, reimbursements, reimbursementItems, policies } from '@/lib/db/schema';
import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm';
import {
  createSkillManager,
  createBudgetAlertSkill,
  createAnomalyDetectorSkill,
} from '@/lib/skills/skill-manager';
import { SkillTrigger } from '@/types';

// 技术费用类别
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

    const body = await request.json();
    const { skillId, params = {} } = body;

    if (!skillId) {
      return NextResponse.json({ error: '缺少 skillId 参数' }, { status: 400 });
    }

    // 获取当月日期范围
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // 获取上月日期范围（用于异常检测对比）
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // 查询当月技术费用
    const currentMonthExpenses = await db
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
        eq(reimbursements.tenantId, user.tenantId),
        gte(reimbursementItems.date, startOfMonth),
        lte(reimbursementItems.date, endOfMonth),
        inArray(reimbursementItems.category, TECH_CATEGORIES),
        inArray(reimbursements.status, ['approved', 'paid', 'pending', 'under_review']),
      ));

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
      ));

    const lastMonthTotal = Number(lastMonthResult[0]?.total) || 0;

    // 按类别汇总当月费用
    const monthlyExpenses: Record<string, number> = {};
    for (const expense of currentMonthExpenses) {
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
    // 简化实现：使用上月数据作为基准
    const historicalAvg: Record<string, { avgAmount: number; stdDev: number }> = {};
    for (const cat of TECH_CATEGORIES) {
      // 实际应该查询更多历史数据计算真正的平均值
      // 这里简化为使用上月数据的 1/30 作为日均值
      const monthlyAvg = lastMonthTotal / TECH_CATEGORIES.length;
      historicalAvg[cat] = {
        avgAmount: monthlyAvg / 10, // 简化：假设每月约10笔费用
        stdDev: monthlyAvg / 20,
      };
    }

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
        name: '', // 可以从 tenant 表获取
        settings: {},
      },
      params: {
        ...params,
        monthlyExpenses,
        budgetLimits,
        currentExpenses: currentMonthExpenses,
        historicalAvg,
        lastMonthTotal,
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
            expenseCount: currentMonthExpenses.length,
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
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const skills = [
      {
        id: 'builtin_budget_alert',
        name: '预算预警通知',
        description: '检测技术费用是否接近或超过月度预算限额',
        category: 'notification',
      },
      {
        id: 'builtin_anomaly_detector',
        name: '异常消费检测',
        description: '检测异常高额的技术费用支出',
        category: 'validation',
      },
      {
        id: 'all_tech_analysis',
        name: '技术费用综合分析',
        description: '执行所有技术费用相关的分析',
        category: 'analysis',
      },
    ];

    return NextResponse.json({
      success: true,
      data: skills,
    });
  } catch (error) {
    console.error('Get skills error:', error);
    return NextResponse.json({ error: '获取 Skill 列表失败' }, { status: 500 });
  }
}
