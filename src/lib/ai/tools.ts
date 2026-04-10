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
    description: `分析报销费用数据，支持所有费用类别，支持单月、多月对比或全部数据分析。

可以分析的内容：
- 总费用、供应商分布、费用类别分布
- 月度环比增长率
- 按状态分布（待审批、已批准、已支付）
- 用户/员工费用排行
- 最近报销单详情
- 特定类别的明细（如"其他"类别的具体内容）
- 按供应商分组的费用统计

支持的费用类别：
- flight: 机票
- train: 火车票
- hotel: 酒店住宿
- meal: 餐饮
- taxi: 交通
- office_supplies: 办公用品
- ai_token: AI服务费用
- cloud_resource: 云资源费用
- software: 软件订阅
- api_service: API服务费用
- hosting: 托管服务费用
- domain: 域名费用
- client_entertainment: 客户招待
- other: 其他

注意：
- 如果用户问"所有费用"、"全部数据"、"历史数据"，设置 allTime=true
- 如果用户问特定类别的明细，设置 focusCategory 并 includeDetails=true
- 如果用户要按供应商分析，设置 groupByVendor=true`,
    parameters: {
      type: 'object',
      properties: {
        allTime: {
          type: 'boolean',
          description: '是否查询全部时间的数据。设为true时忽略months和year参数。用户说"所有"、"全部"、"历史"时应设为true',
          default: false,
        },
        months: {
          type: 'array',
          items: {
            type: 'integer',
            minimum: 1,
            maximum: 12,
          },
          description: '要分析的月份列表，如 [11, 12] 表示11月和12月。allTime=true时可省略',
        },
        year: {
          type: 'integer',
          description: '年份，如 2025 或 2026。allTime=true时可省略',
        },
        scope: {
          type: 'string',
          enum: ['personal', 'team', 'company'],
          description: '分析范围：personal=个人费用，team=团队费用，company=全公司费用',
          default: 'company',
        },
        focusCategory: {
          type: 'string',
          enum: ['flight', 'train', 'hotel', 'meal', 'taxi', 'office_supplies', 'ai_token', 'cloud_resource', 'software', 'api_service', 'hosting', 'domain', 'client_entertainment', 'other'],
          description: '重点关注的类别（可选）。如果用户询问某个特定类别的明细，填写此参数',
        },
        includeDetails: {
          type: 'boolean',
          description: '是否返回费用明细列表。用户要求看"明细"、"详情"、"具体内容"时设为true',
          default: false,
        },
        groupByVendor: {
          type: 'boolean',
          description: '是否按供应商分组统计。用户要求按"供应商"、"服务商"分析时设为true',
          default: false,
        },
        compareWithLastMonth: {
          type: 'boolean',
          description: '是否与上个月对比（仅在单月分析时有效）',
          default: true,
        },
      },
      required: [],
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
 * Tool: Configure Auto-Approval
 * 通过 Chat 对话配置自动审批规则
 */
export const configureAutoApprovalTool: Tool = {
  type: 'function',
  function: {
    name: 'configure_auto_approval',
    description: `配置当前用户（审批人）的自动审批规则。
当用户说"帮我设置自动审批"、"配置自动审批"、"我想自动审批"等时调用此工具。

此工具会：
1. 更新或创建审批人的自动审批配置（profile）
2. 替换所有规则（rules）

重要约束（硬限制，不可修改）：
- 单笔金额上限：$500 USD
- 单日累计上限：$2,000 USD
- 新员工（在职<90天）永远走人工审批
- 合规检查必须通过才可自动审批
- 缓冲期（1小时）内审批人可取消任意自动审批

示例触发场景：
- "设置自动审批，500美金以内、有票据就批"
- "我想让差旅报销自动通过，金额别太大"
- "帮我配置：研发团队的报销不超过300美金自动批"`,
    parameters: {
      type: 'object',
      properties: {
        isEnabled: {
          type: 'boolean',
          description: '是否启用自动审批，默认 true',
          default: true,
        },
        maxAmountCapUSD: {
          type: 'number',
          description: '单笔自动审批金额上限（USD），最大 500，默认 500',
          default: 500,
        },
        cancellationWindowMinutes: {
          type: 'integer',
          description: '缓冲撤销期（分钟），默认 60 分钟',
          default: 60,
        },
        rules: {
          type: 'array',
          description: '自动审批规则列表（会替换所有旧规则）',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: '规则名称，如"差旅报销自动批"',
              },
              priority: {
                type: 'integer',
                description: '优先级，数字越小越先匹配，默认 100',
                default: 100,
              },
              conditions: {
                type: 'object',
                description: '匹配条件',
                properties: {
                  maxAmountUSD: {
                    type: 'number',
                    description: '该规则的金额上限（USD）',
                  },
                  allowedCategories: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '允许的报销类别，如 ["flight","hotel","meal"]',
                  },
                  blockedCategories: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '禁止的报销类别',
                  },
                  allowedDepartmentIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '仅允许指定部门的报销',
                  },
                  requireReceiptsAttached: {
                    type: 'boolean',
                    description: '是否要求有票据（默认 true）',
                    default: true,
                  },
                },
              },
              action: {
                type: 'string',
                enum: ['approve', 'skip'],
                description: '命中后动作：approve=自动批，skip=不处理（人工）',
                default: 'approve',
              },
            },
            required: ['name', 'conditions'],
          },
        },
      },
      required: ['rules'],
    },
  },
};

/**
 * Tool: Configure Auto-Payment
 * 通过 Chat 对话配置自动付款条件（仅财务/管理员）
 */
export const configureAutoPaymentTool: Tool = {
  type: 'function',
  function: {
    name: 'configure_auto_payment',
    description: `配置租户级别的自动付款条件（仅财务/管理员可用）。
当财务说"设置自动打款"、"配置自动付款"、"审批完了自动打"等时调用此工具。

重要约束：
- 单笔上限最高 $500 USD（建议 ≤ $200）
- 最终审批通过后最少等待 24 小时才自动打
- 员工须在职满 90 天
- 合规检查须通过
- 紧急时可一键暂停所有自动付款`,
    parameters: {
      type: 'object',
      properties: {
        isEnabled: {
          type: 'boolean',
          description: '是否启用自动付款',
          default: true,
        },
        maxAmountPerReimbursementUSD: {
          type: 'number',
          description: '单笔自动付款上限（USD），最大 500，建议 ≤ 200',
          default: 200,
        },
        maxDailyTotalUSD: {
          type: 'number',
          description: '每日自动付款总额上限（USD）',
          default: 1000,
        },
        minHoursAfterFinalApproval: {
          type: 'integer',
          description: '最终审批通过后等待多少小时再自动打款，默认 24',
          default: 24,
        },
        employeeMinTenureDays: {
          type: 'integer',
          description: '员工最短在职天数，默认 90',
          default: 90,
        },
        allowedDepartmentIds: {
          type: 'array',
          items: { type: 'string' },
          description: '只自动付款给指定部门（留空=所有部门）',
        },
      },
      required: [],
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
  configureAutoApprovalTool,
  configureAutoPaymentTool,
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
  configure_auto_approval: configureAutoApprovalTool,
  configure_auto_payment: configureAutoPaymentTool,
};

export default allTools;
