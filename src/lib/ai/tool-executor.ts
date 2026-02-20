/**
 * Tool Executor
 *
 * Executes tools called by the LLM and returns results.
 * Supports both static tools and dynamic skill-based tools.
 */

import { isSkillTool, getSkillIdFromToolName, executeSkill } from './skill-tools';

/**
 * Fetch with timeout to prevent hanging
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
 * Uses the general expenses API that works with ALL categories
 */
async function executeAnalyzeExpenses(
  params: AnalyzeExpensesParams,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  try {
    const { months, year, scope = 'company', focusCategory } = params;

    // 计算日期范围
    const endMonth = Math.max(...months);
    const startMonth = Math.min(...months);
    const startDate = new Date(year, startMonth - 1, 1);
    const endDate = new Date(year, endMonth, 0); // 月末

    const queryParams = new URLSearchParams({
      scope,
      period: 'custom',
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      status: 'all', // 查询所有非草稿状态
      internalUserId: context.userId,
      internalTenantId: context.tenantId,
    });

    const baseUrl = context.baseUrl || '';
    // 使用新的通用费用分析 API
    const fullUrl = `${baseUrl}/api/analytics/expenses?${queryParams}`;

    console.log('[Tool Executor] Fetching expenses:', {
      baseUrl,
      fullUrl,
      months,
      year,
      scope,
    });

    const response = await fetchWithTimeout(fullUrl);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Tool Executor] API request failed:', response.status, errorText);
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || '获取数据失败');
    }

    // 如果指定了特定类别，过滤结果
    let categoryData = data.data.byCategory;
    if (focusCategory) {
      categoryData = categoryData.filter((c: any) => c.category === focusCategory);
    }

    return {
      success: true,
      data: {
        period: `${year}年${startMonth}月${startMonth !== endMonth ? ` - ${endMonth}月` : ''}`,
        summary: data.data.summary,
        comparison: data.data.comparison,
        byCategory: categoryData,
        byStatus: data.data.byStatus,
        monthlyTrend: data.data.monthlyTrend,
        userRanking: data.data.userRanking,
        vendorRanking: data.data.vendorRanking,
        recentReimbursements: data.data.recentReimbursements,
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
