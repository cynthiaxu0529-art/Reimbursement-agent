// ============================================================================
// Reimbursement Agent - Core Type Definitions
// ============================================================================

// ----------------------------------------------------------------------------
// Enums & Constants
// ----------------------------------------------------------------------------

/**
 * 费用类别 - 与财务 COA (Chart of Accounts) 对应
 * 每个类别都有对应的 COA 代码，便于财务记账
 */
export const ExpenseCategory = {
  // 差旅费用
  FLIGHT: 'flight',                       // 机票
  TRAIN: 'train',                         // 火车票
  HOTEL: 'hotel',                         // 酒店住宿
  MEAL: 'meal',                           // 餐饮
  TAXI: 'taxi',                           // 出租车/网约车
  CAR_RENTAL: 'car_rental',               // 租车
  FUEL: 'fuel',                           // 燃油费
  PARKING: 'parking',                     // 停车费
  TOLL: 'toll',                           // 过路费

  // 办公费用
  OFFICE_SUPPLIES: 'office_supplies',     // 办公用品
  EQUIPMENT: 'equipment',                 // 设备采购
  SOFTWARE: 'software',                   // 软件订阅

  // 技术费用 - 新增
  AI_TOKEN: 'ai_token',                   // AI Token 消耗 (OpenAI, Anthropic 等)
  CLOUD_RESOURCE: 'cloud_resource',       // 云资源费用 (AWS, GCP, Azure 等)
  API_SERVICE: 'api_service',             // 第三方 API 服务
  HOSTING: 'hosting',                     // 服务器托管
  DOMAIN: 'domain',                       // 域名费用

  // 行政费用 - 新增
  ADMIN_GENERAL: 'admin_general',         // 行政综合费用
  COURIER: 'courier',                     // 快递费
  PRINTING: 'printing',                   // 打印/复印
  PHONE: 'phone',                         // 电话费
  INTERNET: 'internet',                   // 网络费
  UTILITIES: 'utilities',                 // 水电费

  // 业务费用
  CLIENT_ENTERTAINMENT: 'client_entertainment',  // 客户招待
  MARKETING: 'marketing',                 // 市场推广
  TRAINING: 'training',                   // 培训费用
  CONFERENCE: 'conference',               // 会议费用
  MEMBERSHIP: 'membership',               // 会员费/订阅

  // 其他
  OTHER: 'other',                         // 其他费用
} as const;

export type ExpenseCategoryType = typeof ExpenseCategory[keyof typeof ExpenseCategory];

/**
 * COA (Chart of Accounts) 映射配置
 * 将报销类别映射到财务系统的科目代码
 */
export interface COAMapping {
  category: ExpenseCategoryType;
  coaCode: string;                        // 财务科目代码
  coaName: string;                        // 财务科目名称
  coaNameEn?: string;                     // 英文名称
  parentCode?: string;                    // 父级科目代码
  description?: string;
  isActive: boolean;
  requiresReceipt: boolean;               // 是否必须提供票据
  requiresApproval: boolean;              // 是否需要特殊审批
  defaultTaxRate?: number;                // 默认税率
}

/**
 * 支持的货币
 */
export const Currency = {
  CNY: 'CNY',   // 人民币
  USD: 'USD',   // 美元
  EUR: 'EUR',   // 欧元
  GBP: 'GBP',   // 英镑
  JPY: 'JPY',   // 日元
  HKD: 'HKD',   // 港币
  SGD: 'SGD',   // 新加坡元
  AUD: 'AUD',   // 澳元
  CAD: 'CAD',   // 加元
  KRW: 'KRW',   // 韩元
} as const;

export type CurrencyType = typeof Currency[keyof typeof Currency];

/**
 * 报销单状态
 */
export const ReimbursementStatus = {
  DRAFT: 'draft',                 // 草稿
  PENDING: 'pending',             // 待审批
  UNDER_REVIEW: 'under_review',   // 审批中
  APPROVED: 'approved',           // 已批准
  REJECTED: 'rejected',           // 已拒绝
  PROCESSING: 'processing',       // 付款处理中
  PAID: 'paid',                   // 已付款
  CANCELLED: 'cancelled',         // 已取消
} as const;

export type ReimbursementStatusType = typeof ReimbursementStatus[keyof typeof ReimbursementStatus];

/**
 * 行程状态
 */
export const TripStatus = {
  PLANNING: 'planning',           // 计划中
  ONGOING: 'ongoing',             // 进行中
  COMPLETED: 'completed',         // 已完成
  CANCELLED: 'cancelled',         // 已取消
} as const;

export type TripStatusType = typeof TripStatus[keyof typeof TripStatus];

/**
 * 用户角色
 */
export const UserRole = {
  EMPLOYEE: 'employee',           // 普通员工
  MANAGER: 'manager',             // 经理
  FINANCE: 'finance',             // 财务
  ADMIN: 'admin',                 // 管理员
  SUPER_ADMIN: 'super_admin',     // 超级管理员
} as const;

export type UserRoleType = typeof UserRole[keyof typeof UserRole];

// ----------------------------------------------------------------------------
// Core Entities
// ----------------------------------------------------------------------------

/**
 * 租户（多租户 SaaS 支持）
 */
export interface Tenant {
  id: string;
  name: string;                           // 公司/组织名称
  slug: string;                           // URL 友好的标识
  plan: 'free' | 'pro' | 'enterprise';    // 订阅计划
  baseCurrency: CurrencyType;             // 记账本位币
  settings: TenantSettings;
  coaMappings?: COAMapping[];             // 自定义 COA 映射
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantSettings {
  approvalWorkflow: ApprovalWorkflowConfig;
  expenseCategories: ExpenseCategoryConfig[];
  budgetSettings: BudgetSettings;
  integrations: IntegrationSettings;
  notifications: NotificationSettings;
}

export interface ApprovalWorkflowConfig {
  enabled: boolean;
  levels: ApprovalLevel[];
  autoApproveBelow?: number;              // 低于此金额自动批准
}

export interface ApprovalLevel {
  order: number;
  role: UserRoleType;
  amountThreshold?: number;               // 超过此金额需要此级别审批
}

export interface ExpenseCategoryConfig {
  category: ExpenseCategoryType;
  enabled: boolean;
  customName?: string;                    // 自定义显示名称
  coaCode?: string;                       // 覆盖默认 COA 代码
}

export interface BudgetSettings {
  enableBudgetTracking: boolean;
  fiscalYearStart: number;                // 财年开始月份 (1-12)
  alertThreshold: number;                 // 预算警告阈值 (百分比)
}

export interface IntegrationSettings {
  gmail?: { enabled: boolean; scopes: string[] };
  googleCalendar?: { enabled: boolean; calendarIds: string[] };
  outlook?: { enabled: boolean };
  slack?: { enabled: boolean; webhookUrl?: string };
}

export interface NotificationSettings {
  emailNotifications: boolean;
  slackNotifications: boolean;
  notifyOnSubmit: boolean;
  notifyOnApprove: boolean;
  notifyOnReject: boolean;
  notifyOnPaid: boolean;
}

/**
 * 用户
 */
export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRoleType;
  department?: string;
  managerId?: string;                     // 直属上级
  bankAccount?: BankAccount;
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
  branchName?: string;
  swiftCode?: string;                     // 国际转账
  routingNumber?: string;                 // 美国银行
}

export interface UserPreferences {
  language: 'zh-CN' | 'en-US';
  timezone: string;
  defaultCurrency: CurrencyType;
  emailDigest: 'daily' | 'weekly' | 'never';
}

/**
 * 行程记录
 */
export interface Trip {
  id: string;
  tenantId: string;
  userId: string;
  title: string;                          // "北京出差 - 客户拜访"
  purpose?: string;                       // 出差目的
  destination: string;                     // 目的地（必填）
  startDate: Date;
  endDate: Date;
  status: TripStatusType;

  // 预算相关 - 允许缺失，可由 AI 预估
  budget?: TripBudget;

  // 关联数据
  calendarEventIds?: string[];            // 关联的日历事件
  reimbursementIds?: string[];            // 关联的报销单

  // AI 辅助
  aiEstimatedBudget?: TripBudget;         // AI 预估预算
  aiRecommendedBudget?: TripBudget;       // 基于历史数据的推荐预算
  budgetSource?: 'manual' | 'ai_estimated' | 'ai_recommended';

  createdAt: Date;
  updatedAt: Date;
}

export interface TripBudget {
  total: number;
  currency: CurrencyType;
  breakdown?: {
    category: ExpenseCategoryType;
    amount: number;
  }[];
  estimatedBy?: 'user' | 'ai' | 'policy' | 'historical';
  confidence?: number;                    // AI 预估置信度 0-1
  basedOnTrips?: string[];                // 参考的历史行程 ID
}

/**
 * 报销单
 */
export interface Reimbursement {
  id: string;
  tenantId: string;
  userId: string;
  tripId?: string;                        // 关联行程（可选）

  title: string;
  description?: string;

  // 金额信息
  items: ReimbursementItem[];
  totalAmount: number;                    // 原始金额合计
  totalAmountInBaseCurrency: number;      // 转换为记账本位币后的金额
  baseCurrency: CurrencyType;             // 记账本位币

  // 状态
  status: ReimbursementStatusType;

  // 来源追踪
  autoCollected: boolean;                 // 是否自动收集
  sourceType: 'manual' | 'email' | 'calendar' | 'api';

  // 合规检查
  complianceStatus: 'passed' | 'warning' | 'failed' | 'pending';
  complianceIssues?: ComplianceIssue[];

  // AI 辅助
  aiSuggestions?: AISuggestion[];

  // 时间戳
  submittedAt?: Date;
  approvedAt?: Date;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 报销明细
 */
export interface ReimbursementItem {
  id: string;
  reimbursementId: string;

  // 费用信息
  category: ExpenseCategoryType;
  description: string;

  // 金额 - 支持多币种
  amount: number;                         // 原始金额
  currency: CurrencyType;                 // 原始币种
  exchangeRate?: number;                  // 汇率
  amountInBaseCurrency: number;           // 转换后金额

  // 时间地点 - location 允许缺失
  date: Date;
  location?: string;                      // 消费地点（允许缺失）
  vendor?: string;                        // 商家名称

  // 票据关联
  receiptId?: string;
  receiptUrl?: string;

  // 来源追踪
  extractedFromEmail?: boolean;
  ocrConfidence?: number;                 // OCR 识别置信度

  // 合规检查结果
  policyCheck?: PolicyCheckResult;

  // COA 映射
  coaCode?: string;                       // 财务科目代码
  coaName?: string;                       // 财务科目名称
}

/**
 * 票据
 */
export interface Receipt {
  id: string;
  tenantId: string;
  userId: string;

  // 文件信息
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;

  // OCR 结果
  ocrResult?: OCRResult;

  // 来源
  source: 'upload' | 'email' | 'api';
  sourceId?: string;                      // 来源 ID（如邮件 ID）

  // 验证
  verificationStatus: 'pending' | 'verified' | 'failed' | 'manual_review';

  createdAt: Date;
}

export interface OCRResult {
  rawText: string;
  extractedData: {
    amount?: number;
    currency?: CurrencyType;
    date?: Date;
    vendor?: string;
    taxNumber?: string;
    invoiceNumber?: string;
    items?: {
      name: string;
      quantity?: number;
      unitPrice?: number;
      amount: number;
    }[];
  };
  confidence: number;
  processedAt: Date;
}

// ----------------------------------------------------------------------------
// Policy & Compliance
// ----------------------------------------------------------------------------

/**
 * 报销政策
 */
export interface Policy {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  isActive: boolean;
  priority: number;                       // 优先级，数字越小优先级越高

  rules: PolicyRule[];

  // 政策完整性检查
  completenessCheck?: PolicyCompletenessCheck;

  // 来源追踪 - 支持通过 chat 定义
  createdVia: 'ui' | 'chat' | 'api';
  createdByPrompt?: string;               // 如果通过 chat 创建，保存原始 prompt

  createdAt: Date;
  updatedAt: Date;
}

/**
 * 政策规则
 * 所有字段都是可选的，缺失时会提醒制定者补全
 */
export interface PolicyRule {
  id: string;
  policyId: string;
  name: string;

  // 适用范围 - 可选
  category?: ExpenseCategoryType;         // 适用类别
  department?: string;                    // 适用部门
  role?: UserRoleType;                    // 适用角色
  tripType?: string;                      // 适用行程类型

  // 条件 - 可选
  condition?: RuleCondition;

  // 限制 - 可选
  limit?: RuleLimit;

  // 要求 - 可选
  requiresReceipt?: boolean;              // 是否必须提供票据
  requiresApproval?: boolean;             // 是否需要审批
  approvalLevel?: number;                 // 需要的审批级别

  // 提示信息 - 可选
  message?: string;                       // 违规提示信息
  suggestion?: string;                    // 建议信息

  // 规则完整性
  isComplete: boolean;                    // 规则是否完整
  missingFields?: string[];               // 缺失的字段
}

export interface RuleCondition {
  type: 'amount' | 'date' | 'location' | 'frequency' | 'custom';
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'between';
  value: any;
  valueEnd?: any;                         // 用于 between
}

export interface RuleLimit {
  type: 'per_item' | 'per_day' | 'per_trip' | 'per_month' | 'per_year';
  amount: number;
  currency: CurrencyType;
  conditions?: {
    city?: string[];                      // 特定城市的限额
    level?: string[];                     // 特定级别的限额
  };
}

/**
 * 政策完整性检查结果
 */
export interface PolicyCompletenessCheck {
  isComplete: boolean;
  missingCategories: ExpenseCategoryType[];    // 未覆盖的费用类别
  incompleteRules: {
    ruleId: string;
    ruleName: string;
    missingFields: string[];
    suggestion: string;
  }[];
  suggestions: string[];
}

/**
 * 合规问题
 */
export interface ComplianceIssue {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  suggestion?: string;
  itemId?: string;                        // 关联的报销明细
  autoResolvable: boolean;                // 是否可自动解决
}

/**
 * 政策检查结果
 */
export interface PolicyCheckResult {
  passed: boolean;
  ruleId?: string;
  ruleName?: string;
  message?: string;
  severity?: 'info' | 'warning' | 'error';
  actualValue?: any;
  limitValue?: any;
  overAmount?: number;                    // 超出金额
}

// ----------------------------------------------------------------------------
// AI & Suggestions
// ----------------------------------------------------------------------------

/**
 * AI 建议
 */
export interface AISuggestion {
  id: string;
  type: 'missing_receipt' | 'policy_violation' | 'optimization' | 'categorization' | 'budget';
  priority: 'low' | 'medium' | 'high';
  message: string;
  action?: {
    type: 'add_receipt' | 'change_category' | 'split_expense' | 'add_description';
    params: Record<string, any>;
  };
  dismissed: boolean;
  createdAt: Date;
}

/**
 * 预算预估请求
 */
export interface BudgetEstimationRequest {
  tripId?: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  tripType: string;                       // 客户拜访、培训、会议等
  travelers: number;
  includeCategories?: ExpenseCategoryType[];
}

/**
 * 预算预估响应
 */
export interface BudgetEstimationResponse {
  estimated: TripBudget;
  recommended: TripBudget;
  basedOn: {
    policyLimits: boolean;
    historicalData: boolean;
    similarTrips: number;
  };
  breakdown: {
    category: ExpenseCategoryType;
    estimatedAmount: number;
    recommendedAmount: number;
    policyLimit?: number;
    historicalAverage?: number;
    confidence: number;
  }[];
  notes: string[];
}

// ----------------------------------------------------------------------------
// Currency & Exchange
// ----------------------------------------------------------------------------

/**
 * 汇率信息
 */
export interface ExchangeRate {
  fromCurrency: CurrencyType;
  toCurrency: CurrencyType;
  rate: number;
  source: string;                         // 数据来源
  timestamp: Date;
}

/**
 * 货币转换请求
 */
export interface CurrencyConversionRequest {
  amount: number;
  fromCurrency: CurrencyType;
  toCurrency: CurrencyType;
  date?: Date;                            // 可选，使用历史汇率
}

/**
 * 货币转换响应
 */
export interface CurrencyConversionResponse {
  originalAmount: number;
  originalCurrency: CurrencyType;
  convertedAmount: number;
  targetCurrency: CurrencyType;
  exchangeRate: number;
  rateDate: Date;
  source: string;
}

// ----------------------------------------------------------------------------
// Sample Prompts
// ----------------------------------------------------------------------------

/**
 * 示例提示配置
 */
export interface SamplePrompt {
  id: string;
  category: 'reimbursement' | 'policy' | 'trip' | 'report' | 'general';
  trigger: SamplePromptTrigger;
  prompt: string;
  description: string;
  variables?: string[];                   // 可替换的变量
  priority: number;
  isActive: boolean;
}

export interface SamplePromptTrigger {
  type: 'context' | 'intent' | 'time' | 'action';
  conditions: {
    // 上下文触发
    page?: string;                        // 当前页面
    status?: string;                      // 当前状态

    // 意图触发
    keywords?: string[];                  // 关键词

    // 时间触发
    dayOfWeek?: number[];                 // 周几
    dayOfMonth?: number[];                // 几号

    // 动作触发
    afterAction?: string;                 // 某动作之后
  };
}

// ----------------------------------------------------------------------------
// API Response Types
// ----------------------------------------------------------------------------

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ----------------------------------------------------------------------------
// Skill 插件系统
// ----------------------------------------------------------------------------

/**
 * Skill 类型 - 用户可自定义的报销相关能力
 */
export const SkillCategory = {
  DATA_EXTRACTION: 'data_extraction',     // 数据提取（如从特定系统提取数据）
  VALIDATION: 'validation',               // 验证类（如发票真伪验证）
  CALCULATION: 'calculation',             // 计算类（如里程补贴计算）
  INTEGRATION: 'integration',             // 集成类（如与 ERP 系统对接）
  NOTIFICATION: 'notification',           // 通知类（如发送到特定渠道）
  APPROVAL: 'approval',                   // 审批类（如自定义审批逻辑）
  REPORT: 'report',                       // 报表类（如生成自定义报表）
  AI_ENHANCEMENT: 'ai_enhancement',       // AI 增强类（如自定义 AI 处理）
} as const;

export type SkillCategoryType = typeof SkillCategory[keyof typeof SkillCategory];

/**
 * Skill 触发时机
 */
export const SkillTrigger = {
  ON_RECEIPT_UPLOAD: 'on_receipt_upload',           // 票据上传时
  ON_EXPENSE_ADD: 'on_expense_add',                 // 添加费用时
  ON_REIMBURSEMENT_CREATE: 'on_reimbursement_create', // 创建报销单时
  ON_REIMBURSEMENT_SUBMIT: 'on_reimbursement_submit', // 提交报销单时
  ON_APPROVAL_REQUEST: 'on_approval_request',       // 请求审批时
  ON_APPROVAL_COMPLETE: 'on_approval_complete',     // 审批完成时
  ON_PAYMENT_REQUEST: 'on_payment_request',         // 请求付款时
  ON_PAYMENT_COMPLETE: 'on_payment_complete',       // 付款完成时
  ON_TRIP_CREATE: 'on_trip_create',                 // 创建行程时
  ON_TRIP_COMPLETE: 'on_trip_complete',             // 行程结束时
  ON_SCHEDULE: 'on_schedule',                       // 定时触发
  ON_MANUAL: 'on_manual',                           // 手动触发
  ON_CHAT_COMMAND: 'on_chat_command',               // Chat 命令触发
} as const;

export type SkillTriggerType = typeof SkillTrigger[keyof typeof SkillTrigger];

/**
 * Skill 定义
 */
export interface Skill {
  id: string;
  tenantId: string;

  // 基本信息
  name: string;
  description: string;
  category: SkillCategoryType;
  icon?: string;
  version: string;
  author?: string;

  // 触发配置
  triggers: SkillTriggerConfig[];

  // 执行配置
  executor: SkillExecutor;

  // 输入输出定义
  inputSchema?: SkillIOSchema;
  outputSchema?: SkillIOSchema;

  // 权限和状态
  permissions: SkillPermission[];
  isActive: boolean;
  isBuiltIn: boolean;                     // 是否系统内置

  // 配置
  config?: Record<string, any>;
  configSchema?: SkillConfigSchema;

  // 统计
  stats?: SkillStats;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Skill 触发配置
 */
export interface SkillTriggerConfig {
  type: SkillTriggerType;
  conditions?: SkillCondition[];          // 触发条件
  priority?: number;                      // 优先级
  async?: boolean;                        // 是否异步执行
  timeout?: number;                       // 超时时间（毫秒）
}

/**
 * Skill 条件
 */
export interface SkillCondition {
  field: string;                          // 字段路径，如 "expense.category"
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'in' | 'not_in' | 'contains' | 'regex';
  value: any;
}

/**
 * Skill 执行器
 */
export interface SkillExecutor {
  type: 'javascript' | 'webhook' | 'mcp' | 'ai_prompt';

  // JavaScript 执行器
  code?: string;

  // Webhook 执行器
  webhookUrl?: string;
  webhookMethod?: 'GET' | 'POST' | 'PUT';
  webhookHeaders?: Record<string, string>;

  // MCP 执行器
  mcpServer?: string;
  mcpTool?: string;

  // AI Prompt 执行器
  prompt?: string;
  model?: string;
}

/**
 * Skill 输入/输出 Schema
 */
export interface SkillIOSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, {
    type: string;
    description?: string;
    required?: boolean;
    default?: any;
  }>;
  description?: string;
}

/**
 * Skill 配置 Schema
 */
export interface SkillConfigSchema {
  fields: {
    key: string;
    type: 'string' | 'number' | 'boolean' | 'select' | 'secret';
    label: string;
    description?: string;
    required?: boolean;
    default?: any;
    options?: { label: string; value: any }[];  // for select type
  }[];
}

/**
 * Skill 权限
 */
export interface SkillPermission {
  resource: 'reimbursement' | 'trip' | 'receipt' | 'user' | 'policy' | 'payment';
  actions: ('read' | 'write' | 'delete')[];
}

/**
 * Skill 统计
 */
export interface SkillStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;           // 毫秒
  lastExecutedAt?: Date;
}

/**
 * Skill 执行结果
 */
export interface SkillExecutionResult {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  executionTime: number;
  logs?: string[];
}

/**
 * Skill 执行上下文
 */
export interface SkillExecutionContext {
  trigger: SkillTriggerType;
  user: User;
  tenant: Tenant;

  // 根据触发类型，以下字段可选
  reimbursement?: Reimbursement;
  trip?: Trip;
  receipt?: Receipt;
  expenseItem?: ReimbursementItem;

  // 额外参数
  params?: Record<string, any>;
}

/**
 * 内置 Skill 示例
 */
export const BUILT_IN_SKILLS = {
  // 里程补贴计算
  MILEAGE_CALCULATOR: 'mileage_calculator',
  // 发票验真
  INVOICE_VERIFICATION: 'invoice_verification',
  // 汇率转换
  CURRENCY_CONVERTER: 'currency_converter',
  // 预算检查
  BUDGET_CHECKER: 'budget_checker',
  // 审批提醒
  APPROVAL_REMINDER: 'approval_reminder',
  // 报销统计
  EXPENSE_ANALYTICS: 'expense_analytics',
  // 重复检测
  DUPLICATE_DETECTOR: 'duplicate_detector',
  // 智能分类
  SMART_CATEGORIZER: 'smart_categorizer',
} as const;
