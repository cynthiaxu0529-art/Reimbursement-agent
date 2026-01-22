/**
 * Agent 模块导出
 */

export * from './orchestrator';
export * from './budget-estimator';

// Agent 类型
export type AgentType =
  | 'orchestrator'
  | 'email_collector'
  | 'calendar_agent'
  | 'receipt_parser'
  | 'trip_manager'
  | 'compliance_checker'
  | 'budget_estimator'
  | 'payment_agent';

// Agent 状态
export interface AgentStatus {
  type: AgentType;
  status: 'idle' | 'running' | 'completed' | 'error';
  lastRun?: Date;
  result?: any;
  error?: string;
}

// Agent 配置
export interface AgentConfig {
  type: AgentType;
  enabled: boolean;
  autoRun: boolean;
  triggers?: string[];
  settings?: Record<string, any>;
}

// 默认 Agent 配置
export const DEFAULT_AGENT_CONFIGS: AgentConfig[] = [
  {
    type: 'orchestrator',
    enabled: true,
    autoRun: true,
    settings: {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 4096,
    },
  },
  {
    type: 'email_collector',
    enabled: true,
    autoRun: false,
    triggers: ['user_request', 'trip_completed'],
    settings: {
      scanDaysBack: 30,
      emailTypes: ['flight', 'hotel', 'train', 'taxi'],
    },
  },
  {
    type: 'calendar_agent',
    enabled: true,
    autoRun: false,
    triggers: ['user_request', 'daily_scan'],
    settings: {
      scanDaysAhead: 14,
      scanDaysBack: 7,
    },
  },
  {
    type: 'receipt_parser',
    enabled: true,
    autoRun: true,
    triggers: ['receipt_uploaded'],
    settings: {
      ocrProvider: 'default',
      autoCategories: true,
    },
  },
  {
    type: 'trip_manager',
    enabled: true,
    autoRun: true,
    triggers: ['trip_created', 'expense_added'],
    settings: {
      autoLinkExpenses: true,
      checkCompleteness: true,
    },
  },
  {
    type: 'compliance_checker',
    enabled: true,
    autoRun: true,
    triggers: ['expense_added', 'reimbursement_submit'],
    settings: {
      strictMode: false,
      autoSuggest: true,
    },
  },
  {
    type: 'budget_estimator',
    enabled: true,
    autoRun: false,
    triggers: ['trip_created', 'user_request'],
    settings: {
      useHistoricalData: true,
      confidenceThreshold: 0.6,
    },
  },
  {
    type: 'payment_agent',
    enabled: true,
    autoRun: false,
    triggers: ['reimbursement_approved'],
    settings: {
      paymentProvider: 'fluxpay',
      autoProcess: false,
    },
  },
];
