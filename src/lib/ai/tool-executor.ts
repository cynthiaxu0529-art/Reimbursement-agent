/**
 * Tool Executor
 *
 * Executes tools called by the LLM and returns results.
 */

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
 */
async function executeAnalyzeExpenses(
  params: AnalyzeExpensesParams,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  try {
    const { months, year, scope = 'company', focusCategory } = params;

    // If single month, fetch with comparison
    if (months.length === 1) {
      const month = months[0];
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      const queryParams = new URLSearchParams({
        scope,
        period: 'custom',
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        dateFilterType: 'expense_date', // Use accrual basis
      });

      if (focusCategory) {
        queryParams.set('category', focusCategory);
      }

      const baseUrl = context.baseUrl || '';
      const response = await fetch(`${baseUrl}/api/analytics/tech-expenses?${queryParams}`);

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        data: {
          period: `${year}年${month}月`,
          ...data.data,
        },
      };
    }

    // Multi-month comparison
    const results = [];
    for (const month of months) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      const queryParams = new URLSearchParams({
        scope,
        period: 'custom',
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        dateFilterType: 'expense_date',
      });

      if (focusCategory) {
        queryParams.set('category', focusCategory);
      }

      const baseUrl = context.baseUrl || '';
      const response = await fetch(`${baseUrl}/api/analytics/tech-expenses?${queryParams}`);

      if (!response.ok) {
        throw new Error(`API request failed for ${month}月: ${response.status}`);
      }

      const data = await response.json();

      results.push({
        month: `${year}年${month}月`,
        monthNumber: month,
        year,
        ...data.data,
      });
    }

    return {
      success: true,
      data: {
        type: 'multi-month-comparison',
        months: results,
      },
    };
  } catch (error: any) {
    console.error('Error executing analyze_expenses:', error);
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
    const response = await fetch(`${baseUrl}/api/skills/execute`, {
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
    const response = await fetch(`${baseUrl}/api/skills/execute`, {
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
    const response = await fetch(`${baseUrl}/api/skills/execute`, {
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
 * Main tool executor function
 */
export async function executeTool(
  toolName: string,
  params: any,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  console.log(`[Tool Executor] Executing tool: ${toolName}`, params);

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
      return {
        success: false,
        error: `Unknown tool: ${toolName}`,
      };
  }
}

export default executeTool;
