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

/**
 * Fetch with timeout to prevent hanging (used for external calls)
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

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
  months: number[];
  year: number;
  scope?: 'personal' | 'team' | 'company';
  focusCategory?: string;
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
 */
async function executeAnalyzeExpenses(
  params: AnalyzeExpensesParams,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  try {
    const { months, year, scope = 'company', focusCategory } = params;

    console.log('[Tool Executor] Analyzing expenses:', { months, year, scope, focusCategory, userId: context.userId });

    // 获取用户信息
    const user = await db.query.users.findFirst({
      where: eq(users.id, context.userId),
    });

    if (!user || user.tenantId !== context.tenantId) {
      throw new Error('用户认证失败');
    }

    // 计算日期范围
    const endMonth = Math.max(...months);
    const startMonth = Math.min(...months);
    const startDate = new Date(year, startMonth - 1, 1);
    const endDate = new Date(year, endMonth, 0, 23, 59, 59); // 月末

    console.log('[Tool Executor] Date range:', { startDate, endDate });

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
      gte(reimbursements.createdAt, startDate),
      lte(reimbursements.createdAt, endDate),
    ];

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

    // 聚合统计
    const byCategory: Record<string, { total: number; count: number }> = {};
    const byMonth: Record<string, { total: number; count: number }> = {};
    const byStatus: Record<string, { total: number; count: number }> = {};
    const byUser: Record<string, { name: string; total: number; count: number }> = {};
    const byVendor: Record<string, { total: number; count: number }> = {};

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

    // 类别中文名称
    const categoryLabels: Record<string, string> = {
      flight: '机票', train: '火车票', hotel: '酒店住宿', meal: '餐饮',
      taxi: '交通', office_supplies: '办公用品', ai_token: 'AI 服务',
      cloud_resource: '云资源', api_service: 'API 服务', software: '软件订阅',
      hosting: '托管服务', domain: '域名', client_entertainment: '客户招待', other: '其他',
    };

    // 按明细统计
    for (const item of items) {
      const amount = item.amountInBaseCurrency || 0;
      const category = item.category || 'other';

      if (!byCategory[category]) byCategory[category] = { total: 0, count: 0 };
      byCategory[category].total += amount;
      byCategory[category].count += 1;

      const vendor = item.vendor || '未知供应商';
      if (!byVendor[vendor]) byVendor[vendor] = { total: 0, count: 0 };
      byVendor[vendor].total += amount;
      byVendor[vendor].count += 1;
    }

    // 格式化类别数据
    let categoryData = Object.entries(byCategory)
      .map(([key, value]) => ({
        category: key,
        label: categoryLabels[key] || key,
        total: Math.round(value.total * 100) / 100,
        count: value.count,
        percentage: totalAmount > 0 ? Math.round((value.total / totalAmount) * 1000) / 10 : 0,
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
      .map(([userId, data]) => ({
        userId, name: data.name,
        total: Math.round(data.total * 100) / 100,
        count: data.count,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // 供应商排行
    const vendorRanking = Object.entries(byVendor)
      .map(([vendor, value]) => ({
        vendor,
        total: Math.round(value.total * 100) / 100,
        count: value.count,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

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
        period: `${year}年${startMonth}月${startMonth !== endMonth ? ` - ${endMonth}月` : ''}`,
        summary: {
          totalAmount: Math.round(totalAmount * 100) / 100,
          totalCount,
          currency: baseCurrency,
          averageAmount: totalCount > 0 ? Math.round((totalAmount / totalCount) * 100) / 100 : 0,
          categoryCount: categoryData.length,
          vendorCount: Object.keys(byVendor).length,
        },
        byCategory: categoryData,
        byStatus: statusData,
        monthlyTrend,
        userRanking: scope !== 'personal' ? userRanking : undefined,
        vendorRanking,
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

/**
 * Execute check_budget_alert tool
 */
async function executeCheckBudgetAlert(
  params: CheckBudgetAlertParams,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  try {
    // For now, call the built-in skill
    // In the future, this could call a dedicated budget API
    const baseUrl = context.baseUrl || '';
    const response = await fetchWithTimeout(`${baseUrl}/api/skills/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        skillId: 'builtin_budget_alert',
        context: {
          userId: context.userId,
          tenantId: context.tenantId,
          params: params,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Skill execution failed: ${response.status}`);
    }

    const result = await response.json();

    return {
      success: true,
      data: result.data,
    };
  } catch (error: any) {
    console.error('Error executing check_budget_alert:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Execute detect_anomalies tool
 */
async function executeDetectAnomalies(
  params: DetectAnomaliesParams,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  try {
    const baseUrl = context.baseUrl || '';
    const response = await fetchWithTimeout(`${baseUrl}/api/skills/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        skillId: 'builtin_anomaly_detector',
        context: {
          userId: context.userId,
          tenantId: context.tenantId,
          params: params,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Skill execution failed: ${response.status}`);
    }

    const result = await response.json();

    return {
      success: true,
      data: result.data,
    };
  } catch (error: any) {
    console.error('Error executing detect_anomalies:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Execute analyze_timeliness tool
 */
async function executeAnalyzeTimeliness(
  params: AnalyzeTimelinessParams,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  try {
    const baseUrl = context.baseUrl || '';
    const response = await fetchWithTimeout(`${baseUrl}/api/skills/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        skillId: 'builtin_timeliness_analysis',
        context: {
          userId: context.userId,
          tenantId: context.tenantId,
          params: params,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Skill execution failed: ${response.status}`);
    }

    const result = await response.json();

    return {
      success: true,
      data: result.data,
    };
  } catch (error: any) {
    console.error('Error executing analyze_timeliness:', error);
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

    default:
      // Try to execute as a skill if tool name not found
      return executeSkillTool(`skill_${toolName}`, params, context);
  }
}

export default executeTool;
