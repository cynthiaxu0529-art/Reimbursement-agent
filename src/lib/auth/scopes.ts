/**
 * API Key Scope 权限控制系统
 *
 * 定义 Agent 可以执行的操作范围。
 * 每个 scope 对应一组 API 操作，遵循 resource:action 命名规范。
 *
 * 安全原则：
 * 1. 默认最小权限 - Agent 只能做 scope 明确允许的事
 * 2. 敏感操作（审批、付款）默认不开放
 * 3. Scope 与用户角色双重检查 - 即使 scope 允许，用户角色也必须匹配
 */

// ============================================================================
// Scope 定义
// ============================================================================

/**
 * 所有可用的 API Scope
 */
export const API_SCOPES = {
  // 报销单
  REIMBURSEMENT_READ: 'reimbursement:read',
  REIMBURSEMENT_CREATE: 'reimbursement:create',
  REIMBURSEMENT_UPDATE: 'reimbursement:update',
  REIMBURSEMENT_SUBMIT: 'reimbursement:submit',
  REIMBURSEMENT_CANCEL: 'reimbursement:cancel',

  // 票据/发票
  RECEIPT_READ: 'receipt:read',
  RECEIPT_UPLOAD: 'receipt:upload',

  // 政策
  POLICY_READ: 'policy:read',

  // 行程
  TRIP_READ: 'trip:read',
  TRIP_CREATE: 'trip:create',

  // 分析
  ANALYTICS_READ: 'analytics:read',

  // 审批（敏感操作 - 需要明确授权）
  APPROVAL_READ: 'approval:read',
  APPROVAL_APPROVE: 'approval:approve',

  // 付款（高敏感操作）
  PAYMENT_READ: 'payment:read',
  PAYMENT_PROCESS: 'payment:process',

  // 记账汇总（财务/会计专用）
  ACCOUNTING_SUMMARY_READ: 'accounting_summary:read',
  ACCOUNT_MAPPING_READ: 'account_mapping:read',
  ACCOUNT_MAPPING_UPDATE: 'account_mapping:update',

  // 用户/设置（只读）
  PROFILE_READ: 'profile:read',
  SETTINGS_READ: 'settings:read',
} as const;

export type ApiScope = typeof API_SCOPES[keyof typeof API_SCOPES];

// ============================================================================
// Scope 元数据
// ============================================================================

export interface ScopeMetadata {
  scope: ApiScope;
  label: string;
  description: string;
  category: 'basic' | 'sensitive' | 'critical';
  /** 需要的最低用户角色 */
  requiredRoles?: string[];
}

/**
 * Scope 详细信息，用于 UI 展示和权限检查
 */
export const SCOPE_METADATA: Record<ApiScope, ScopeMetadata> = {
  [API_SCOPES.REIMBURSEMENT_READ]: {
    scope: API_SCOPES.REIMBURSEMENT_READ,
    label: '查看报销单',
    description: '读取报销单列表和详情',
    category: 'basic',
  },
  [API_SCOPES.REIMBURSEMENT_CREATE]: {
    scope: API_SCOPES.REIMBURSEMENT_CREATE,
    label: '创建报销单',
    description: '创建新的报销申请（草稿状态）',
    category: 'basic',
  },
  [API_SCOPES.REIMBURSEMENT_UPDATE]: {
    scope: API_SCOPES.REIMBURSEMENT_UPDATE,
    label: '修改报销单',
    description: '更新已有报销单的信息',
    category: 'basic',
  },
  [API_SCOPES.REIMBURSEMENT_SUBMIT]: {
    scope: API_SCOPES.REIMBURSEMENT_SUBMIT,
    label: '提交报销单',
    description: '将报销单从草稿状态提交审批',
    category: 'sensitive',
  },
  [API_SCOPES.REIMBURSEMENT_CANCEL]: {
    scope: API_SCOPES.REIMBURSEMENT_CANCEL,
    label: '取消报销单',
    description: '取消已提交的报销单',
    category: 'basic',
  },
  [API_SCOPES.RECEIPT_READ]: {
    scope: API_SCOPES.RECEIPT_READ,
    label: '查看票据',
    description: '读取已上传的票据信息',
    category: 'basic',
  },
  [API_SCOPES.RECEIPT_UPLOAD]: {
    scope: API_SCOPES.RECEIPT_UPLOAD,
    label: '上传票据',
    description: '上传发票和收据图片',
    category: 'basic',
  },
  [API_SCOPES.POLICY_READ]: {
    scope: API_SCOPES.POLICY_READ,
    label: '查看政策',
    description: '读取报销政策和限额规则',
    category: 'basic',
  },
  [API_SCOPES.TRIP_READ]: {
    scope: API_SCOPES.TRIP_READ,
    label: '查看行程',
    description: '读取出差行程信息',
    category: 'basic',
  },
  [API_SCOPES.TRIP_CREATE]: {
    scope: API_SCOPES.TRIP_CREATE,
    label: '创建行程',
    description: '创建新的出差行程',
    category: 'basic',
  },
  [API_SCOPES.ANALYTICS_READ]: {
    scope: API_SCOPES.ANALYTICS_READ,
    label: '查看分析',
    description: '查看费用分析和统计报告',
    category: 'basic',
  },
  [API_SCOPES.APPROVAL_READ]: {
    scope: API_SCOPES.APPROVAL_READ,
    label: '查看审批',
    description: '查看审批状态和审批链',
    category: 'sensitive',
    requiredRoles: ['manager', 'admin', 'super_admin'],
  },
  [API_SCOPES.APPROVAL_APPROVE]: {
    scope: API_SCOPES.APPROVAL_APPROVE,
    label: '执行审批',
    description: '批准或拒绝报销申请（高权限操作）',
    category: 'critical',
    requiredRoles: ['manager', 'super_admin'],
  },
  [API_SCOPES.PAYMENT_READ]: {
    scope: API_SCOPES.PAYMENT_READ,
    label: '查看付款',
    description: '查看付款状态和记录',
    category: 'sensitive',
    requiredRoles: ['finance', 'super_admin'],
  },
  [API_SCOPES.PAYMENT_PROCESS]: {
    scope: API_SCOPES.PAYMENT_PROCESS,
    label: '处理付款',
    description: '发起和处理付款（高权限操作）',
    category: 'critical',
    requiredRoles: ['finance', 'super_admin'],
  },
  [API_SCOPES.ACCOUNTING_SUMMARY_READ]: {
    scope: API_SCOPES.ACCOUNTING_SUMMARY_READ,
    label: '查看记账汇总',
    description: '读取按半月周期汇总的报销入账数据',
    category: 'sensitive',
    requiredRoles: ['finance', 'super_admin'],
  },
  [API_SCOPES.ACCOUNT_MAPPING_READ]: {
    scope: API_SCOPES.ACCOUNT_MAPPING_READ,
    label: '查看科目映射',
    description: '读取费用类别到会计科目的映射规则',
    category: 'basic',
    requiredRoles: ['finance', 'super_admin'],
  },
  [API_SCOPES.ACCOUNT_MAPPING_UPDATE]: {
    scope: API_SCOPES.ACCOUNT_MAPPING_UPDATE,
    label: '修改科目映射',
    description: '更新报销明细的会计科目映射（高权限操作）',
    category: 'critical',
    requiredRoles: ['finance', 'super_admin'],
  },
  [API_SCOPES.PROFILE_READ]: {
    scope: API_SCOPES.PROFILE_READ,
    label: '查看个人信息',
    description: '读取用户个人资料',
    category: 'basic',
  },
  [API_SCOPES.SETTINGS_READ]: {
    scope: API_SCOPES.SETTINGS_READ,
    label: '查看设置',
    description: '读取公司和系统设置',
    category: 'basic',
  },
};

// ============================================================================
// Scope 预设组合（方便用户快速选择）
// ============================================================================

/**
 * 预定义的 scope 组合
 */
export const SCOPE_PRESETS = {
  /** 只读：查看报销、票据、政策 */
  READONLY: [
    API_SCOPES.REIMBURSEMENT_READ,
    API_SCOPES.RECEIPT_READ,
    API_SCOPES.POLICY_READ,
    API_SCOPES.TRIP_READ,
    API_SCOPES.PROFILE_READ,
  ],

  /** 员工基础：创建和管理自己的报销 */
  EMPLOYEE_BASIC: [
    API_SCOPES.REIMBURSEMENT_READ,
    API_SCOPES.REIMBURSEMENT_CREATE,
    API_SCOPES.REIMBURSEMENT_UPDATE,
    API_SCOPES.REIMBURSEMENT_SUBMIT,
    API_SCOPES.REIMBURSEMENT_CANCEL,
    API_SCOPES.RECEIPT_READ,
    API_SCOPES.RECEIPT_UPLOAD,
    API_SCOPES.POLICY_READ,
    API_SCOPES.TRIP_READ,
    API_SCOPES.TRIP_CREATE,
    API_SCOPES.PROFILE_READ,
  ],

  /** 分析：额外包含分析权限 */
  ANALYTICS: [
    API_SCOPES.REIMBURSEMENT_READ,
    API_SCOPES.RECEIPT_READ,
    API_SCOPES.POLICY_READ,
    API_SCOPES.ANALYTICS_READ,
    API_SCOPES.PROFILE_READ,
  ],

  /** Accounting Agent：读取记账汇总 + 科目映射（供外部会计系统拉取数据） */
  ACCOUNTING_AGENT: [
    API_SCOPES.ACCOUNTING_SUMMARY_READ,
    API_SCOPES.ACCOUNT_MAPPING_READ,
    API_SCOPES.REIMBURSEMENT_READ,
    API_SCOPES.RECEIPT_READ,
    API_SCOPES.ANALYTICS_READ,
    API_SCOPES.SETTINGS_READ,
  ],
} as const;

// ============================================================================
// Scope 校验函数
// ============================================================================

/**
 * HTTP 路由到 scope 的映射表
 * 用于自动判断某个 API 请求需要哪个 scope
 */
export const ROUTE_SCOPE_MAP: Record<string, { method: string; scope: ApiScope }[]> = {
  '/api/reimbursements': [
    { method: 'GET', scope: API_SCOPES.REIMBURSEMENT_READ },
    { method: 'POST', scope: API_SCOPES.REIMBURSEMENT_CREATE },
  ],
  '/api/reimbursements/[id]': [
    { method: 'GET', scope: API_SCOPES.REIMBURSEMENT_READ },
    { method: 'PUT', scope: API_SCOPES.REIMBURSEMENT_UPDATE },
    { method: 'DELETE', scope: API_SCOPES.REIMBURSEMENT_CANCEL },
  ],
  '/api/reimbursements/[id]/items/[itemId]': [
    { method: 'PATCH', scope: API_SCOPES.REIMBURSEMENT_UPDATE },
    { method: 'DELETE', scope: API_SCOPES.REIMBURSEMENT_UPDATE },
  ],
  '/api/reimbursements/stats': [
    { method: 'GET', scope: API_SCOPES.ANALYTICS_READ },
  ],
  '/api/upload': [
    { method: 'POST', scope: API_SCOPES.RECEIPT_UPLOAD },
  ],
  '/api/ocr': [
    { method: 'POST', scope: API_SCOPES.RECEIPT_UPLOAD },
  ],
  '/api/settings/policies': [
    { method: 'GET', scope: API_SCOPES.POLICY_READ },
  ],
  '/api/analytics/expenses': [
    { method: 'GET', scope: API_SCOPES.ANALYTICS_READ },
  ],
  '/api/analytics/tech-expenses': [
    { method: 'GET', scope: API_SCOPES.ANALYTICS_READ },
  ],
  '/api/analytics/vendors': [
    { method: 'GET', scope: API_SCOPES.ANALYTICS_READ },
  ],
  '/api/payments': [
    { method: 'GET', scope: API_SCOPES.PAYMENT_READ },
  ],
  '/api/payments/process': [
    { method: 'POST', scope: API_SCOPES.PAYMENT_PROCESS },
  ],
  '/api/settings/categories': [
    { method: 'GET', scope: API_SCOPES.SETTINGS_READ },
  ],
  '/api/settings/profile': [
    { method: 'GET', scope: API_SCOPES.PROFILE_READ },
  ],
  '/api/reimbursement-summaries': [
    { method: 'GET', scope: API_SCOPES.ACCOUNTING_SUMMARY_READ },
  ],
  '/api/internal/accounting-summaries': [
    { method: 'GET', scope: API_SCOPES.ACCOUNTING_SUMMARY_READ },
  ],
  '/api/internal/update-item-account': [
    { method: 'PATCH', scope: API_SCOPES.ACCOUNT_MAPPING_UPDATE },
  ],
  '/api/internal/sync-accounts': [
    { method: 'POST', scope: API_SCOPES.ACCOUNT_MAPPING_UPDATE },
  ],
};

/**
 * 检查给定的 scopes 是否包含所需的 scope
 */
export function hasScope(grantedScopes: string[], requiredScope: ApiScope): boolean {
  return grantedScopes.includes(requiredScope);
}

/**
 * 根据请求路径和方法，获取所需的 scope
 */
export function getRequiredScope(path: string, method: string): ApiScope | null {
  // 精确匹配
  const routes = ROUTE_SCOPE_MAP[path];
  if (routes) {
    const match = routes.find(r => r.method === method.toUpperCase());
    if (match) return match.scope;
  }

  // 带参数的路径匹配（如 /api/reimbursements/xxx）
  for (const [pattern, routes] of Object.entries(ROUTE_SCOPE_MAP)) {
    const regex = new RegExp(
      '^' + pattern.replace(/\[.*?\]/g, '[^/]+') + '$'
    );
    if (regex.test(path)) {
      const match = routes.find(r => r.method === method.toUpperCase());
      if (match) return match.scope;
    }
  }

  return null;
}

/**
 * 验证 scope 列表是否合法（所有值必须是已知的 scope）
 */
export function validateScopes(scopes: string[]): { valid: boolean; invalid: string[] } {
  const validScopes = new Set(Object.values(API_SCOPES));
  const invalid = scopes.filter(s => !validScopes.has(s as ApiScope));
  return {
    valid: invalid.length === 0,
    invalid,
  };
}

/**
 * 检查 scope 是否需要特定的用户角色
 * 返回 true 表示角色满足要求
 */
export function checkScopeRoleRequirement(
  scope: ApiScope,
  userRoles: string[]
): boolean {
  const metadata = SCOPE_METADATA[scope];
  if (!metadata?.requiredRoles) return true;
  return userRoles.some(role => metadata.requiredRoles!.includes(role));
}

/**
 * 获取某个 scope 的安全等级
 */
export function getScopeCategory(scope: ApiScope): 'basic' | 'sensitive' | 'critical' {
  return SCOPE_METADATA[scope]?.category || 'basic';
}

/**
 * 获取所有可用 scope 的列表，按类别分组
 */
export function getScopesByCategory(): Record<string, ScopeMetadata[]> {
  const grouped: Record<string, ScopeMetadata[]> = {
    basic: [],
    sensitive: [],
    critical: [],
  };

  for (const metadata of Object.values(SCOPE_METADATA)) {
    grouped[metadata.category].push(metadata);
  }

  return grouped;
}
