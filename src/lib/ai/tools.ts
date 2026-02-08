/**
 * AI Assistant Tools Definition
 *
 * This file defines all the tools (functions) that the LLM can call
 * to retrieve data and perform analysis.
 */

import { Tool } from './openrouter-client';

/**
 * Tool 1: Analyze Tech Expenses
 *
 * Analyzes technical expenses for specified time periods and categories.
 * Supports single month analysis and multi-month comparison.
 */
export const analyzeExpensesTool: Tool = {
  type: 'function',
  function: {
    name: 'analyze_expenses',
    description: `分析技术费用数据，支持单月分析或多月对比。

可以分析的内容：
- 总费用、供应商分布、类别分布
- 月度环比增长率
- 多个月份的对比分析
- 特定类别的深入分析

支持的费用类别：
- ai_token: AI Token费用（OpenAI, Anthropic等）
- cloud_resource: 云资源费用（AWS, Azure, GCP等）
- software: 软件订阅（GitHub, Notion等）
- api_service: API服务费用
- hosting: 托管服务费用
- domain: 域名费用`,
    parameters: {
      type: 'object',
      properties: {
        months: {
          type: 'array',
          items: {
            type: 'integer',
            minimum: 1,
            maximum: 12,
          },
          description: '要分析的月份列表，如 [11, 12] 表示11月和12月',
        },
        year: {
          type: 'integer',
          description: '年份，如 2025 或 2026。如果用户说"去年"或查询的月份都大于当前月份，应使用去年',
        },
        scope: {
          type: 'string',
          enum: ['personal', 'team', 'company'],
          description: '分析范围：personal=个人费用，team=团队费用，company=全公司费用',
          default: 'company',
        },
        focusCategory: {
          type: 'string',
          enum: ['ai_token', 'cloud_resource', 'software', 'api_service', 'hosting', 'domain'],
          description: '重点关注的类别（可选）。如果用户特别询问某个类别，填写此参数',
        },
        compareWithLastMonth: {
          type: 'boolean',
          description: '是否与上个月对比（仅在单月分析时有效）',
          default: true,
        },
      },
      required: ['months', 'year'],
    },
  },
};

/**
 * Tool 2: Check Budget Alert
 *
 * Checks budget usage and alerts for potential overspending.
 */
export const checkBudgetAlertTool: Tool = {
  type: 'function',
  function: {
    name: 'check_budget_alert',
    description: `检查预算使用情况和预警信息。

会检查：
- 当前预算使用率
- 是否接近预算上限（>80%）
- 是否超出预算
- 按类别的预算分配和使用情况
- 预计何时耗尽预算（基于当前消费速度）

适用场景：
- 用户询问"预算还剩多少"
- 用户询问"有没有超支风险"
- 用户询问"这个月还能花多少钱"`,
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['personal', 'team', 'company'],
          description: '检查范围',
          default: 'company',
        },
        period: {
          type: 'string',
          enum: ['month', 'quarter', 'year'],
          description: '预算周期：month=月度预算，quarter=季度预算，year=年度预算',
          default: 'month',
        },
      },
    },
  },
};

/**
 * Tool 3: Detect Anomalies
 *
 * Detects unusual spending patterns and potential issues.
 */
export const detectAnomaliesTool: Tool = {
  type: 'function',
  function: {
    name: 'detect_anomalies',
    description: `检测异常消费模式和潜在问题。

会检测的异常类型：
- 突然的大额支出（超过平均值的2倍以上）
- 频繁的小额重复支出（可能的重复扣费）
- 未知或新增的供应商
- 消费趋势突变（环比增长超过50%）
- 异常时间的支出（如凌晨时段）
- 超出常规范围的单次支出

适用场景：
- 用户询问"有没有异常消费"
- 用户询问"最近有什么不正常的支出"
- 主动风险识别`,
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['personal', 'team', 'company'],
          description: '检测范围',
          default: 'company',
        },
        period: {
          type: 'string',
          enum: ['week', 'month', 'quarter'],
          description: '检测时间段：week=最近一周，month=最近一个月，quarter=最近一季度',
          default: 'month',
        },
        sensitivity: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: '检测灵敏度：low=只检测明显异常，medium=平衡，high=检测轻微异常',
          default: 'medium',
        },
      },
    },
  },
};

/**
 * Tool 4: Analyze Timeliness
 *
 * Analyzes reimbursement submission timeliness and identifies delays.
 */
export const analyzeTimelinessTool: Tool = {
  type: 'function',
  function: {
    name: 'analyze_timeliness',
    description: `分析报销提交的及时性，识别延迟报销问题。

分析内容：
- 费用发生到提交的平均间隔天数
- 及时报销率（30天内提交的比例）
- 延迟报销的分布（30-60天、60-90天、90天以上）
- 最长延迟和最短延迟
- 中位数间隔天数
- 按用户/部门的时效性排名

权责发生制原则：
- 使用费用实际发生日期（expense_date）而非提交日期（submission_date）
- 识别跨期报销问题
- 发现可能的政策合规风险

适用场景：
- 用户询问"报销及时吗"
- 用户询问"有多少跨期报销"
- 用户询问"哪些人报销比较拖延"`,
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['personal', 'team', 'company'],
          description: '分析范围',
          default: 'company',
        },
        period: {
          type: 'string',
          enum: ['month', 'quarter', 'year'],
          description: '分析时间段',
          default: 'month',
        },
        groupBy: {
          type: 'string',
          enum: ['user', 'department', 'category'],
          description: '分组维度（可选）',
        },
      },
    },
  },
};

/**
 * Tool 5: Search Policies
 *
 * Search reimbursement policies and answer policy-related questions.
 */
export const searchPoliciesTool: Tool = {
  type: 'function',
  function: {
    name: 'search_policies',
    description: `搜索报销政策和规定，回答政策相关问题。

可以查询的内容：
- 特定费用类别的报销标准和上限
- 报销流程和审批要求
- 单据和凭证要求
- 报销时限规定
- 特殊情况处理方式

适用场景：
- 用户询问"AI费用怎么报销"
- 用户询问"报销有什么要求"
- 用户询问"需要什么材料"
- 用户询问"审批流程是什么"`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '查询内容，如"AI Token费用报销政策"',
        },
        category: {
          type: 'string',
          enum: ['ai_token', 'cloud_resource', 'software', 'api_service', 'hosting', 'domain', 'general'],
          description: '费用类别（可选，用于缩小搜索范围）',
        },
      },
      required: ['query'],
    },
  },
};

/**
 * All available tools
 */
export const allTools: Tool[] = [
  analyzeExpensesTool,
  checkBudgetAlertTool,
  detectAnomaliesTool,
  analyzeTimelinessTool,
  searchPoliciesTool,
];

/**
 * Tool name to tool mapping
 */
export const toolMap: Record<string, Tool> = {
  analyze_expenses: analyzeExpensesTool,
  check_budget_alert: checkBudgetAlertTool,
  detect_anomalies: detectAnomaliesTool,
  analyze_timeliness: analyzeTimelinessTool,
  search_policies: searchPoliciesTool,
};

export default allTools;
