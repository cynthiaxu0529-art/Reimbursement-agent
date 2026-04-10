/**
 * Tool Executor
 *
 * Executes tools called by the LLM and returns results.
 * Uses direct database queries for reliability (no HTTP self-calls).
 */

import { isSkillTool, getSkillIdFromToolName, executeSkill } from './skill-tools';
import { db } from '@/lib/db';
import { users, reimbursements, reimbursementItems, tenants, policies } from '@/lib/db/schema';
import { eq, and, gte, lte, inArray, sql, desc } from 'drizzle-orm';
import { getUserRoles, isAdmin, canApprove, canProcessPayment } from '@/lib/auth/roles';
import { getVisibleUserIds } from '@/lib/department/department-service';
import { SYSTEM_MAX_AMOUNT_USD, SYSTEM_DAILY_LIMIT_USD } from '@/lib/auto-approval/risk-checker';

/**
 * Tool execution context
 */
export interface ToolExecutionContext {
  userId: string;
  tenantId: string;
  baseUrl?: string;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Analyze Expenses Tool Parameters
 */
interface AnalyzeExpensesParams {
  allTime?: boolean;
  months?: number[];
  year?: number;
  scope?: 'personal' | 'team' | 'company';
  focusCategory?: string;
  includeDetails?: boolean;
  groupByVendor?: boolean;
  compareWithLastMonth?: boolean;
}

/**
 * Check Budget Alert Tool Parameters
 */
interface CheckBudgetAlertParams {
  scope?: 'personal' | 'team' | 'company';
  period?: 'month' | 'quarter' | 'year';
}

/**
 * Detect Anomalies Tool Parameters
 */
interface DetectAnomaliesParams {
  scope?: 'personal' | 'team' | 'company';
  period?: 'week' | 'month' | 'quarter';
  sensitivity?: 'low' | 'medium' | 'high';
}

/**
 * Analyze Timeliness Tool Parameters
 */
interface AnalyzeTimelinessParams {
  scope?: 'personal' | 'team' | 'company';
  period?: 'month' | 'quarter' | 'year';
  groupBy?: 'user' | 'department' | 'category';
}

/**
 * Search Policies Tool Parameters
 */
interface SearchPoliciesParams {
  query: string;
  category?: string;
}

/**
 * Execute analyze_expenses tool
 * Direct database query for reliability (no HTTP self-calls)
 * Supports: allTime, focusCategory, includeDetails, groupByVendor
 */
async function executeAnalyzeExpenses(
  params: AnalyzeExpensesParams,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  try {
    const {
      allTime = false,
      months,
      year,
      scope = 'company',
      focusCategory,
      includeDetails = false,
      groupByVendor = false,
    } = params;

    // 如果不是全时间查询，需要有月份和年份，否则默认当前月
    let queryMonths = months;
    let queryYear = year;
    const now = new Date();

    if (!allTime) {
      if (!queryMonths || !Array.isArray(queryMonths) || queryMonths.length === 0) {
        queryMonths = [now.getMonth() + 1]; // 默认当前月
      }
      if (!queryYear || queryYear < 2000 || queryYear > 2100) {
        queryYear = now.getFullYear(); // 默认当前年
      }
    }

    console.log('[Tool Executor] Analyzing expenses:', {
      allTime, months: queryMonths, year: queryYear, scope, focusCategory,
      includeDetails, groupByVendor, userId: context.userId
    });

    // 获取用户信息
    const user = await db.query.users.findFirst({
      where: eq(users.id, context.userId),
    });

    if (!user || user.tenantId !== context.tenantId) {
      throw new Error('用户认证失败');
    }

    // 获取租户本位币
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, context.tenantId),
      columns: { baseCurrency: true },
    });
    const baseCurrency = tenant?.baseCurrency || 'USD';

    // 构建基础查询条件
    const conditions: any[] = [
      eq(reimbursements.tenantId, context.tenantId),
      inArray(reimbursements.status, ['pending', 'under_review', 'approved', 'processing', 'paid']),
    ];

    // 日期范围条件（仅非全时间查询时添加）
    let periodLabel = '全部时间';
    if (!allTime && queryMonths && queryYear) {
      const endMonth = Math.max(...queryMonths);
      const startMonth = Math.min(...queryMonths);
      const startDate = new Date(queryYear, startMonth - 1, 1);
      const endDate = new Date(queryYear, endMonth, 0, 23, 59, 59);

      conditions.push(gte(reimbursements.createdAt, startDate));
      conditions.push(lte(reimbursements.createdAt, endDate));

      periodLabel = `${queryYear}年${startMonth}月${startMonth !== endMonth ? ` - ${endMonth}月` : ''}`;
      console.log('[Tool Executor] Date range:', { startDate, endDate });
    }

    // 权限过滤
    const userRoles = getUserRoles(user);
    if (scope === 'personal') {
      conditions.push(eq(reimbursements.userId, context.userId));
    } else if (scope === 'team' || scope === 'company') {
      if (!isAdmin(userRoles) && !canApprove(userRoles) && !canProcessPayment(userRoles)) {
        conditions.push(eq(reimbursements.userId, context.userId));
      } else {
        const visibleUserIds = await getVisibleUserIds(context.userId, context.tenantId, userRoles);
        if (visibleUserIds !== null && visibleUserIds.length > 0) {
          conditions.push(inArray(reimbursements.userId, visibleUserIds));
        } else if (visibleUserIds !== null && visibleUserIds.length === 0) {
          conditions.push(eq(reimbursements.userId, context.userId));
        }
      }
    }

    // 查询报销单
    const reimbursementList = await db
      .select({
        id: reimbursements.id,
        userId: reimbursements.userId,
        title: reimbursements.title,
        status: reimbursements.status,
        totalAmount: reimbursements.totalAmount,
        totalAmountInBaseCurrency: reimbursements.totalAmountInBaseCurrency,
        createdAt: reimbursements.createdAt,
      })
      .from(reimbursements)
      .where(and(...conditions))
      .orderBy(desc(reimbursements.createdAt))
      .limit(500);

    console.log('[Tool Executor] Found reimbursements:', reimbursementList.length);

    // 获取报销明细
    const reimbursementIds = reimbursementList.map(r => r.id);
    let items: any[] = [];

    if (reimbursementIds.length > 0) {
      items = await db
        .select({
          id: reimbursementItems.id,
          reimbursementId: reimbursementItems.reimbursementId,
          category: reimbursementItems.category,
          description: reimbursementItems.description,
          amount: reimbursementItems.amount,
          currency: reimbursementItems.currency,
          amountInBaseCurrency: reimbursementItems.amountInBaseCurrency,
          vendor: reimbursementItems.vendor,
          date: reimbursementItems.date,
        })
        .from(reimbursementItems)
        .where(inArray(reimbursementItems.reimbursementId, reimbursementIds));
    }

    console.log('[Tool Executor] Found items:', items.length);

    // 获取用户信息
    const userIds = [...new Set(reimbursementList.map(r => r.userId))];
    const userMap = new Map<string, string>();

    if (userIds.length > 0) {
      const usersData = await db.query.users.findMany({
        where: inArray(users.id, userIds),
        columns: { id: true, name: true },
      });
      usersData.forEach(u => userMap.set(u.id, u.name));
    }

    // 类别中文名称
    const categoryLabels: Record<string, string> = {
      flight: '机票', train: '火车票', hotel: '酒店住宿', meal: '餐饮',
      taxi: '交通', office_supplies: '办公用品', ai_token: 'AI 服务',
      cloud_resource: '云资源', api_service: 'API 服务', software: '软件订阅',
      hosting: '托管服务', domain: '域名', client_entertainment: '客户招待', other: '其他',
    };

    // 聚合统计
    const byCategory: Record<string, { total: number; count: number; items: any[] }> = {};
    const byMonth: Record<string, { total: number; count: number }> = {};
    const byStatus: Record<string, { total: number; count: number }> = {};
    const byUser: Record<string, { name: string; total: number; count: number }> = {};
    const byVendor: Record<string, { total: number; count: number; categories: Set<string> }> = {};
    // 按类别-供应商统计（用于 groupByVendor + focusCategory）
    const categoryVendorStats: Record<string, Record<string, { total: number; count: number }>> = {};

    let totalAmount = 0;
    const totalCount = reimbursementList.length;

    // 按报销单统计
    for (const r of reimbursementList) {
      const amount = r.totalAmountInBaseCurrency || 0;
      totalAmount += amount;

      // 按状态
      if (!byStatus[r.status]) byStatus[r.status] = { total: 0, count: 0 };
      byStatus[r.status].total += amount;
      byStatus[r.status].count += 1;

      // 按用户
      if (!byUser[r.userId]) byUser[r.userId] = { name: userMap.get(r.userId) || '未知', total: 0, count: 0 };
      byUser[r.userId].total += amount;
      byUser[r.userId].count += 1;

      // 按月份
      const monthKey = r.createdAt
        ? `${r.createdAt.getFullYear()}-${String(r.createdAt.getMonth() + 1).padStart(2, '0')}`
        : 'unknown';
      if (!byMonth[monthKey]) byMonth[monthKey] = { total: 0, count: 0 };
      byMonth[monthKey].total += amount;
      byMonth[monthKey].count += 1;
    }

    // 按明细统计
    for (const item of items) {
      const amount = item.amountInBaseCurrency || 0;
      const category = item.category || 'other';
      const vendor = item.vendor || '未知供应商';

      // 按类别
      if (!byCategory[category]) byCategory[category] = { total: 0, count: 0, items: [] };
      byCategory[category].total += amount;
      byCategory[category].count += 1;
      // 如果需要明细，收集该类别的所有项目
      if (includeDetails && (!focusCategory || category === focusCategory)) {
        byCategory[category].items.push({
          description: item.description,
          vendor: item.vendor,
          amount: item.amount,
          currency: item.currency,
          amountInBaseCurrency: Math.round(amount * 100) / 100,
          date: item.date?.toISOString().split('T')[0],
        });
      }

      // 按供应商
      if (!byVendor[vendor]) byVendor[vendor] = { total: 0, count: 0, categories: new Set() };
      byVendor[vendor].total += amount;
      byVendor[vendor].count += 1;
      byVendor[vendor].categories.add(category);

      // 按类别-供应商（用于 groupByVendor）
      if (groupByVendor) {
        if (!categoryVendorStats[category]) categoryVendorStats[category] = {};
        if (!categoryVendorStats[category][vendor]) categoryVendorStats[category][vendor] = { total: 0, count: 0 };
        categoryVendorStats[category][vendor].total += amount;
        categoryVendorStats[category][vendor].count += 1;
      }
    }

    // 格式化类别数据
    let categoryData = Object.entries(byCategory)
      .map(([key, value]) => ({
        category: key,
        label: categoryLabels[key] || key,
        total: Math.round(value.total * 100) / 100,
        count: value.count,
        percentage: totalAmount > 0 ? Math.round((value.total / totalAmount) * 1000) / 10 : 0,
        // 如果需要明细，添加 items
        ...(includeDetails && value.items.length > 0 ? { items: value.items } : {}),
      }))
      .sort((a, b) => b.total - a.total);

    // 如果指定了特定类别，过滤结果
    if (focusCategory) {
      categoryData = categoryData.filter(c => c.category === focusCategory);
    }

    // 格式化月度趋势
    const monthlyTrend = Object.entries(byMonth)
      .map(([month, value]) => ({
        month,
        total: Math.round(value.total * 100) / 100,
        count: value.count,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // 状态中文
    const statusLabels: Record<string, string> = {
      pending: '待审批', under_review: '审核中', approved: '已批准',
      processing: '处理中', paid: '已支付', rejected: '已拒绝',
    };

    const statusData = Object.entries(byStatus)
      .map(([status, value]) => ({
        status,
        label: statusLabels[status] || status,
        total: Math.round(value.total * 100) / 100,
        count: value.count,
      }))
      .sort((a, b) => b.count - a.count);

    // 用户排行
    const userRanking = Object.entries(byUser)
      .map(([uId, data]) => ({
        userId: uId, name: data.name,
        total: Math.round(data.total * 100) / 100,
        count: data.count,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // 供应商排行
    let vendorRanking = Object.entries(byVendor)
      .map(([vendor, value]) => ({
        vendor,
        total: Math.round(value.total * 100) / 100,
        count: value.count,
        categories: Array.from(value.categories).map(c => categoryLabels[c] || c),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    // 如果有 focusCategory + groupByVendor，返回该类别按供应商的统计
    let categoryVendorBreakdown: any = undefined;
    if (groupByVendor && focusCategory && categoryVendorStats[focusCategory]) {
      categoryVendorBreakdown = Object.entries(categoryVendorStats[focusCategory])
        .map(([vendor, stats]) => ({
          vendor,
          total: Math.round(stats.total * 100) / 100,
          count: stats.count,
        }))
        .sort((a, b) => b.total - a.total);
    } else if (groupByVendor && !focusCategory) {
      // 技术费用类别的供应商统计
      const techCategories = ['ai_token', 'cloud_resource', 'api_service', 'software', 'hosting', 'domain'];
      const techVendorStats: Record<string, { total: number; count: number }> = {};
      for (const cat of techCategories) {
        if (categoryVendorStats[cat]) {
          for (const [vendor, stats] of Object.entries(categoryVendorStats[cat])) {
            if (!techVendorStats[vendor]) techVendorStats[vendor] = { total: 0, count: 0 };
            techVendorStats[vendor].total += stats.total;
            techVendorStats[vendor].count += stats.count;
          }
        }
      }
      categoryVendorBreakdown = Object.entries(techVendorStats)
        .map(([vendor, stats]) => ({
          vendor,
          total: Math.round(stats.total * 100) / 100,
          count: stats.count,
        }))
        .sort((a, b) => b.total - a.total);
    }

    // 最近报销单
    const recentReimbursements = reimbursementList.slice(0, 10).map(r => ({
      id: r.id,
      title: r.title,
      status: r.status,
      amount: Math.round((r.totalAmountInBaseCurrency || 0) * 100) / 100,
      currency: baseCurrency,
      submitter: userMap.get(r.userId) || '未知',
      createdAt: r.createdAt?.toISOString(),
    }));

    return {
      success: true,
      data: {
        period: periodLabel,
        summary: {
          totalAmount: Math.round(totalAmount * 100) / 100,
          totalCount,
          itemCount: items.length,
          currency: baseCurrency,
          averageAmount: totalCount > 0 ? Math.round((totalAmount / totalCount) * 100) / 100 : 0,
          categoryCount: Object.keys(byCategory).length,
          vendorCount: Object.keys(byVendor).length,
        },
        byCategory: categoryData,
        byStatus: statusData,
        monthlyTrend,
        userRanking: scope !== 'personal' ? userRanking : undefined,
        vendorRanking,
        // 按供应商分组的类别统计（仅在 groupByVendor 时）
        ...(categoryVendorBreakdown ? { categoryVendorBreakdown } : {}),
        recentReimbursements,
      },
    };
  } catch (error: any) {
    console.error('[Tool Executor] Error executing analyze_expenses:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// 技术费用类别（用于预算预警和异常检测）
const TECH_CATEGORIES = ['ai_token', 'cloud_resource', 'api_service', 'software', 'hosting', 'domain'];

/**
 * 获取权限过滤条件：返回可见用户ID列表
 */
async function getPermissionFilteredUserIds(
  userId: string,
  tenantId: string,
  scope: string
): Promise<string[] | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user || user.tenantId !== tenantId) {
    throw new Error('用户认证失败');
  }

  const userRoles = getUserRoles(user);

  if (scope === 'personal') {
    return [userId];
  }

  if (scope === 'team' || scope === 'company') {
    if (!isAdmin(userRoles) && !canApprove(userRoles) && !canProcessPayment(userRoles)) {
      return [userId];
    }
    const visibleUserIds = await getVisibleUserIds(userId, tenantId, userRoles);
    if (visibleUserIds !== null && visibleUserIds.length === 0) {
      return [userId];
    }
    return visibleUserIds;
  }

  return null;
}

/**
 * 查询技术费用明细（共用逻辑）
 */
async function queryTechExpenses(
  tenantId: string,
  visibleUserIds: string[] | null,
  startDate: Date,
  endDate: Date
) {
  const baseConditions: any[] = [
    eq(reimbursements.tenantId, tenantId),
    inArray(reimbursements.status, ['approved', 'paid', 'pending', 'under_review']),
  ];

  if (visibleUserIds !== null && visibleUserIds.length > 0) {
    baseConditions.push(inArray(reimbursements.userId, visibleUserIds));
  }

  return db
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
      gte(reimbursementItems.date, startDate),
      lte(reimbursementItems.date, endDate),
      inArray(reimbursementItems.category, TECH_CATEGORIES),
    ));
}

/**
 * Execute check_budget_alert tool
 * Direct database query + skill execution (no HTTP self-calls)
 */
async function executeCheckBudgetAlert(
  params: CheckBudgetAlertParams,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  try {
    const { scope = 'company' } = params;

    console.log('[Tool Executor] Checking budget alert:', { scope, userId: context.userId });

    const visibleUserIds = await getPermissionFilteredUserIds(context.userId, context.tenantId, scope);

    // 当月日期范围
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // 查询当月技术费用
    const techExpenses = await queryTechExpenses(context.tenantId, visibleUserIds, startOfMonth, endOfMonth);

    // 按类别汇总
    const monthlyExpenses: Record<string, number> = {};
    for (const expense of techExpenses) {
      monthlyExpenses[expense.category] = (monthlyExpenses[expense.category] || 0) + expense.amount;
    }

    // 获取政策中的预算限额
    const policyList = await db.query.policies.findMany({
      where: eq(policies.tenantId, context.tenantId),
    });

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

    // 执行预算预警 Skill
    const { createBudgetAlertSkill, createSkillManager } = await import('@/lib/skills/skill-manager');
    const { SkillTrigger } = await import('@/types');

    const skill = createBudgetAlertSkill(context.tenantId);
    const manager = createSkillManager(context.tenantId, [skill]);
    const skillContext = {
      trigger: SkillTrigger.ON_CHAT_COMMAND,
      user: { id: context.userId, name: '', email: '', role: '' },
      tenant: { id: context.tenantId, name: '', settings: {} },
      params: { ...params, monthlyExpenses, budgetLimits },
    };

    const results = await manager.executeTrigger(SkillTrigger.ON_CHAT_COMMAND, skillContext as any);
    const result = results.get('builtin_budget_alert');

    return {
      success: result?.success ?? false,
      data: result?.data,
      error: result?.error ? String(result.error) : undefined,
    };
  } catch (error: any) {
    console.error('[Tool Executor] Error executing check_budget_alert:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Execute detect_anomalies tool
 * Direct database query + skill execution (no HTTP self-calls)
 */
async function executeDetectAnomalies(
  params: DetectAnomaliesParams,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  try {
    const { scope = 'company' } = params;

    console.log('[Tool Executor] Detecting anomalies:', { scope, userId: context.userId });

    const visibleUserIds = await getPermissionFilteredUserIds(context.userId, context.tenantId, scope);

    // 当月日期范围
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // 上月日期范围
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // 查询当月技术费用
    const currentMonthTechExpenses = await queryTechExpenses(context.tenantId, visibleUserIds, startOfMonth, endOfMonth);

    // 查询上月技术费用总额
    const baseConditions: any[] = [
      eq(reimbursements.tenantId, context.tenantId),
      inArray(reimbursements.status, ['approved', 'paid']),
    ];
    if (visibleUserIds !== null && visibleUserIds.length > 0) {
      baseConditions.push(inArray(reimbursements.userId, visibleUserIds));
    }

    const lastMonthResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(${reimbursementItems.amountInBaseCurrency}), 0)`,
      })
      .from(reimbursementItems)
      .innerJoin(reimbursements, eq(reimbursementItems.reimbursementId, reimbursements.id))
      .where(and(
        ...baseConditions,
        gte(reimbursementItems.date, startOfLastMonth),
        lte(reimbursementItems.date, endOfLastMonth),
        inArray(reimbursementItems.category, TECH_CATEGORIES),
      ));

    const lastMonthTotal = Number(lastMonthResult[0]?.total) || 0;

    // 计算历史平均值
    const historicalAvg: Record<string, { avgAmount: number; stdDev: number }> = {};
    for (const cat of TECH_CATEGORIES) {
      const monthlyAvg = lastMonthTotal / TECH_CATEGORIES.length;
      historicalAvg[cat] = {
        avgAmount: monthlyAvg / 10,
        stdDev: monthlyAvg / 20,
      };
    }

    // 执行异常检测 Skill
    const { createAnomalyDetectorSkill, createSkillManager } = await import('@/lib/skills/skill-manager');
    const { SkillTrigger } = await import('@/types');

    const skill = createAnomalyDetectorSkill(context.tenantId);
    const manager = createSkillManager(context.tenantId, [skill]);
    const skillContext = {
      trigger: SkillTrigger.ON_CHAT_COMMAND,
      user: { id: context.userId, name: '', email: '', role: '' },
      tenant: { id: context.tenantId, name: '', settings: {} },
      params: {
        ...params,
        currentExpenses: currentMonthTechExpenses,
        historicalAvg,
        lastMonthTotal,
      },
    };

    const results = await manager.executeTrigger(SkillTrigger.ON_CHAT_COMMAND, skillContext as any);
    const result = results.get('builtin_anomaly_detector');

    return {
      success: result?.success ?? false,
      data: result?.data,
      error: result?.error ? String(result.error) : undefined,
    };
  } catch (error: any) {
    console.error('[Tool Executor] Error executing detect_anomalies:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Execute analyze_timeliness tool
 * Direct database query + skill execution (no HTTP self-calls)
 */
async function executeAnalyzeTimeliness(
  params: AnalyzeTimelinessParams,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  try {
    const { scope = 'company' } = params;

    console.log('[Tool Executor] Analyzing timeliness:', { scope, userId: context.userId });

    const visibleUserIds = await getPermissionFilteredUserIds(context.userId, context.tenantId, scope);

    // 当月日期范围
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // 构建查询条件
    const baseConditions: any[] = [
      eq(reimbursements.tenantId, context.tenantId),
      inArray(reimbursements.status, ['approved', 'paid', 'pending', 'under_review']),
    ];
    if (visibleUserIds !== null && visibleUserIds.length > 0) {
      baseConditions.push(inArray(reimbursements.userId, visibleUserIds));
    }

    // 查询当月所有费用
    const allExpenses = await db
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

    // 获取报销单的提交日期
    const reimbursementIds = [...new Set(allExpenses.map(e => e.reimbursementId))];
    const reimbursementSubmitDates = new Map<string, Date>();
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

    // 准备时效性分析数据
    const timelinessExpenses = allExpenses.map(e => ({
      ...e,
      submittedAt: reimbursementSubmitDates.get(e.reimbursementId) || now,
    }));

    // 执行时效性分析 Skill
    const { createTimelinessAnalysisSkill, createSkillManager } = await import('@/lib/skills/skill-manager');
    const { SkillTrigger } = await import('@/types');

    const skill = createTimelinessAnalysisSkill(context.tenantId);
    const manager = createSkillManager(context.tenantId, [skill]);
    const skillContext = {
      trigger: SkillTrigger.ON_CHAT_COMMAND,
      user: { id: context.userId, name: '', email: '', role: '' },
      tenant: { id: context.tenantId, name: '', settings: {} },
      params: { ...params, expenses: timelinessExpenses },
      reimbursement: { submittedAt: now },
    };

    const results = await manager.executeTrigger(SkillTrigger.ON_CHAT_COMMAND, skillContext as any);
    const result = results.get('builtin_timeliness_analysis');

    return {
      success: result?.success ?? false,
      data: result?.data,
      error: result?.error ? String(result.error) : undefined,
    };
  } catch (error: any) {
    console.error('[Tool Executor] Error executing analyze_timeliness:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Execute search_policies tool
 */
async function executeSearchPolicies(
  params: SearchPoliciesParams,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  try {
    // For now, return mock policy data
    // In the future, this should search a policy database or vector store
    const { query, category } = params;

    // Mock policy responses based on category
    const policies: Record<string, any> = {
      ai_token: {
        title: 'AI Token费用报销政策',
        maxAmount: 5000,
        currency: 'USD',
        approvalRequired: true,
        requiredDocuments: ['发票/账单', 'API使用记录', '业务需求说明'],
        timeLimit: '费用发生后30天内提交',
        notes: [
          '仅限业务必需的AI服务',
          '需要提供具体使用场景说明',
          '单次超过$1000需要CTO审批',
        ],
      },
      cloud_resource: {
        title: '云资源费用报销政策',
        maxAmount: 10000,
        currency: 'USD',
        approvalRequired: true,
        requiredDocuments: ['云服务商发票', '资源使用明细', '项目编号'],
        timeLimit: '费用发生后30天内提交',
        notes: [
          '需要关联到具体项目',
          '长期订阅需要提前申请',
          '测试环境资源需及时清理',
        ],
      },
      software: {
        title: '软件订阅费用报销政策',
        maxAmount: 2000,
        currency: 'USD',
        approvalRequired: true,
        requiredDocuments: ['订阅发票', '使用说明', '团队审批'],
        timeLimit: '费用发生后30天内提交',
        notes: [
          '团队共用软件需要团队负责人审批',
          '个人学习用途不予报销',
          '优先使用公司统一采购的软件',
        ],
      },
      general: {
        title: '通用报销政策',
        timeLimit: '费用发生后30天内提交',
        requiredDocuments: ['真实有效的发票或收据', '费用明细说明'],
        approvalFlow: '提交 → 直属领导审批 → 财务审核 → 打款',
        notes: [
          '所有报销需要真实、完整的凭证',
          '超过30天的费用需要特殊说明',
          '虚假报销将被严肃处理',
        ],
      },
    };

    const policyData = category ? policies[category] || policies.general : policies.general;

    return {
      success: true,
      data: {
        query,
        category: category || 'general',
        policy: policyData,
        matchConfidence: category ? 0.95 : 0.7,
      },
    };
  } catch (error: any) {
    console.error('Error executing search_policies:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Execute a dynamic skill tool
 */
async function executeSkillTool(
  toolName: string,
  params: any,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  try {
    const skillId = getSkillIdFromToolName(toolName);
    if (!skillId) {
      return {
        success: false,
        error: `Invalid skill tool name: ${toolName}`,
      };
    }

    console.log(`[Tool Executor] Executing skill: ${skillId}`, params);

    const result = await executeSkill(skillId, params, context);

    return {
      success: result.success ?? true,
      data: result.data,
      error: result.error,
    };
  } catch (error: any) {
    console.error(`[Tool Executor] Error executing skill ${toolName}:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Main tool executor function
 *
 * Supports:
 * - Static tools (analyze_expenses, check_budget_alert, etc.)
 * - Dynamic skill tools (skill_budget_alert, skill_anomaly_detector, etc.)
 */
export async function executeTool(
  toolName: string,
  params: any,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  console.log(`[Tool Executor] Executing tool: ${toolName}`, params);

  // Check if this is a skill-based tool
  if (isSkillTool(toolName)) {
    return executeSkillTool(toolName, params, context);
  }

  // Handle static tools
  switch (toolName) {
    case 'analyze_expenses':
      return executeAnalyzeExpenses(params, context);

    case 'check_budget_alert':
      return executeCheckBudgetAlert(params, context);

    case 'detect_anomalies':
      return executeDetectAnomalies(params, context);

    case 'analyze_timeliness':
      return executeAnalyzeTimeliness(params, context);

    case 'search_policies':
      return executeSearchPolicies(params, context);

    case 'configure_auto_approval':
      return executeConfigureAutoApproval(params, context);

    case 'configure_auto_payment':
      return executeConfigureAutoPayment(params, context);

    default:
      // Try to execute as a skill if tool name not found
      return executeSkillTool(`skill_${toolName}`, params, context);
  }
}

// ─────────────────────────────────────────────
// configure_auto_approval handler
// ─────────────────────────────────────────────
async function executeConfigureAutoApproval(
  params: {
    isEnabled?: boolean;
    maxAmountCapUSD?: number;
    cancellationWindowMinutes?: number;
    rules: Array<{ name: string; priority?: number; conditions?: object; action?: string }>;
  },
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { autoApprovalProfiles, autoApprovalRules } = await import('@/lib/db/schema');

  const cappedAmount = Math.min(params.maxAmountCapUSD ?? SYSTEM_MAX_AMOUNT_USD, SYSTEM_MAX_AMOUNT_USD);

  const maxExpiry = new Date();
  maxExpiry.setMonth(maxExpiry.getMonth() + 6);

  const now = new Date();

  // Upsert profile
  const existing = await db
    .select({ id: autoApprovalProfiles.id })
    .from(autoApprovalProfiles)
    .where(
      and(
        eq(autoApprovalProfiles.userId, context.userId),
        eq(autoApprovalProfiles.tenantId, context.tenantId)
      )
    )
    .limit(1);

  let profileId: string;

  if (existing.length > 0) {
    profileId = existing[0].id;
    await db
      .update(autoApprovalProfiles)
      .set({
        isEnabled: params.isEnabled !== false,
        maxAmountCapUSD: cappedAmount,
        dailyLimitUSD: SYSTEM_DAILY_LIMIT_USD,
        cancellationWindowMinutes: params.cancellationWindowMinutes ?? 60,
        expiresAt: maxExpiry,
        createdViaChat: true,
        updatedAt: now,
      })
      .where(eq(autoApprovalProfiles.id, profileId));
  } else {
    const [inserted] = await db
      .insert(autoApprovalProfiles)
      .values({
        tenantId: context.tenantId,
        userId: context.userId,
        isEnabled: params.isEnabled !== false,
        maxAmountCapUSD: cappedAmount,
        dailyLimitUSD: SYSTEM_DAILY_LIMIT_USD,
        cancellationWindowMinutes: params.cancellationWindowMinutes ?? 60,
        expiresAt: maxExpiry,
        createdViaChat: true,
        updatedAt: now,
      })
      .returning({ id: autoApprovalProfiles.id });
    profileId = inserted.id;
  }

  // Replace rules
  await db.delete(autoApprovalRules).where(eq(autoApprovalRules.profileId, profileId));

  if (params.rules && params.rules.length > 0) {
    await db.insert(autoApprovalRules).values(
      params.rules.map((r, i) => ({
        profileId,
        priority: r.priority ?? (i + 1) * 10,
        name: r.name,
        conditions: r.conditions ?? {},
        action: r.action ?? 'approve',
        isActive: true,
        updatedAt: now,
      }))
    );
  }

  return {
    success: true,
    data: {
      profileId,
      isEnabled: params.isEnabled !== false,
      maxAmountCapUSD: cappedAmount,
      dailyLimitUSD: SYSTEM_DAILY_LIMIT_USD,
      cancellationWindowMinutes: params.cancellationWindowMinutes ?? 60,
      expiresAt: maxExpiry.toISOString(),
      rulesCount: params.rules?.length ?? 0,
      message: `自动审批已${params.isEnabled !== false ? '启用' : '配置'}，共 ${params.rules?.length ?? 0} 条规则，单笔上限 $${cappedAmount}，缓冲期 ${params.cancellationWindowMinutes ?? 60} 分钟，6个月后到期`,
    },
  };
}

// ─────────────────────────────────────────────
// configure_auto_payment handler
// ─────────────────────────────────────────────
async function executeConfigureAutoPayment(
  params: {
    isEnabled?: boolean;
    maxAmountPerReimbursementUSD?: number;
    maxDailyTotalUSD?: number;
    minHoursAfterFinalApproval?: number;
    employeeMinTenureDays?: number;
    allowedDepartmentIds?: string[];
  },
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { autoPaymentProfiles } = await import('@/lib/db/schema');

  // Check permission
  const [currentUser] = await db
    .select({ role: users.role, roles: users.roles })
    .from(users)
    .where(eq(users.id, context.userId))
    .limit(1);

  if (!canProcessPayment(getUserRoles(currentUser || {}))) {
    return { success: false, error: '需要财务或管理员权限才能配置自动付款' };
  }

  const SYSTEM_MAX_PAYMENT_USD = 500;
  const maxAmount = Math.min(params.maxAmountPerReimbursementUSD ?? 200, SYSTEM_MAX_PAYMENT_USD);

  const maxExpiry = new Date();
  maxExpiry.setMonth(maxExpiry.getMonth() + 6);

  const conditions = {
    maxAmountPerReimbursementUSD: maxAmount,
    maxDailyTotalUSD: params.maxDailyTotalUSD ?? 1000,
    minHoursAfterFinalApproval: params.minHoursAfterFinalApproval ?? 24,
    requirePolicyPassed: true,
    employeeMinTenureDays: params.employeeMinTenureDays ?? 90,
    ...(params.allowedDepartmentIds?.length ? { allowedDepartmentIds: params.allowedDepartmentIds } : {}),
  };

  const now = new Date();

  const existing = await db
    .select({ id: autoPaymentProfiles.id })
    .from(autoPaymentProfiles)
    .where(eq(autoPaymentProfiles.tenantId, context.tenantId))
    .limit(1);

  let profileId: string;

  if (existing.length > 0) {
    profileId = existing[0].id;
    await db
      .update(autoPaymentProfiles)
      .set({ isEnabled: params.isEnabled !== false, conditions, expiresAt: maxExpiry, updatedAt: now })
      .where(eq(autoPaymentProfiles.id, profileId));
  } else {
    const [inserted] = await db
      .insert(autoPaymentProfiles)
      .values({
        tenantId: context.tenantId,
        createdByUserId: context.userId,
        isEnabled: params.isEnabled !== false,
        conditions,
        expiresAt: maxExpiry,
        updatedAt: now,
      })
      .returning({ id: autoPaymentProfiles.id });
    profileId = inserted.id;
  }

  return {
    success: true,
    data: {
      profileId,
      isEnabled: params.isEnabled !== false,
      conditions,
      expiresAt: maxExpiry.toISOString(),
      message: `自动付款已${params.isEnabled !== false ? '启用' : '配置'}，单笔上限 $${maxAmount}，审批通过后等待 ${conditions.minHoursAfterFinalApproval} 小时自动打款，6个月后到期`,
    },
  };
}

export default executeTool;
