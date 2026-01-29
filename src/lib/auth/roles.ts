/**
 * 统一角色定义和权限映射
 *
 * 设计原则：
 * 1. 数据库角色和前端角色使用相同命名（消除映射混乱）
 * 2. 集中管理所有角色相关常量
 * 3. 提供类型安全的角色检查函数
 */

// ============ 角色定义 ============

/**
 * 系统角色枚举
 * 与数据库 user_role enum 保持一致
 */
export const ROLES = {
  EMPLOYEE: 'employee',      // 普通员工 - 提交报销
  MANAGER: 'manager',        // 经理/审批人 - 审批权限
  FINANCE: 'finance',        // 财务 - 支付处理权限
  ADMIN: 'admin',            // 管理员 - 完整权限
  SUPER_ADMIN: 'super_admin', // 超级管理员 - 最高权限
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

/**
 * 前端显示角色（用于UI展示和角色切换）
 * 注意：manager 在前端显示为 "审批人"
 */
export const FRONTEND_ROLES = {
  EMPLOYEE: 'employee',
  APPROVER: 'approver',  // 对应数据库的 manager
  FINANCE: 'finance',
  ADMIN: 'admin',
} as const;

export type FrontendRole = typeof FRONTEND_ROLES[keyof typeof FRONTEND_ROLES];

// ============ 角色权限等级 ============

/**
 * 角色权限优先级（数字越大权限越高）
 * 用于：1. 注册时选择最高权限角色 2. 判断邀请权限
 */
export const ROLE_PRIORITY: Record<Role, number> = {
  [ROLES.EMPLOYEE]: 1,
  [ROLES.MANAGER]: 2,
  [ROLES.FINANCE]: 3,
  [ROLES.ADMIN]: 4,
  [ROLES.SUPER_ADMIN]: 5,
};

// ============ 角色分组 ============

/**
 * 具有审批权限的角色
 */
export const APPROVER_ROLES: Role[] = [
  ROLES.MANAGER,
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN,
];

/**
 * 具有财务权限的角色
 */
export const FINANCE_ROLES: Role[] = [
  ROLES.FINANCE,
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN,
];

/**
 * 具有管理员权限的角色
 */
export const ADMIN_ROLES: Role[] = [
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN,
];

// ============ 角色映射 ============

/**
 * 数据库角色 → 前端角色映射
 */
export const DB_TO_FRONTEND_ROLE: Record<Role, FrontendRole> = {
  [ROLES.EMPLOYEE]: FRONTEND_ROLES.EMPLOYEE,
  [ROLES.MANAGER]: FRONTEND_ROLES.APPROVER,
  [ROLES.FINANCE]: FRONTEND_ROLES.FINANCE,
  [ROLES.ADMIN]: FRONTEND_ROLES.ADMIN,
  [ROLES.SUPER_ADMIN]: FRONTEND_ROLES.ADMIN,
};

/**
 * 前端角色 → 数据库角色映射
 */
export const FRONTEND_TO_DB_ROLE: Record<FrontendRole, Role> = {
  [FRONTEND_ROLES.EMPLOYEE]: ROLES.EMPLOYEE,
  [FRONTEND_ROLES.APPROVER]: ROLES.MANAGER,
  [FRONTEND_ROLES.FINANCE]: ROLES.FINANCE,
  [FRONTEND_ROLES.ADMIN]: ROLES.ADMIN,
};

/**
 * 邀请时的角色映射（支持前端和后端角色名）
 */
export const INVITE_ROLE_MAPPING: Record<string, Role> = {
  employee: ROLES.EMPLOYEE,
  approver: ROLES.MANAGER,  // 前端名称
  manager: ROLES.MANAGER,   // 数据库名称
  finance: ROLES.FINANCE,
  admin: ROLES.ADMIN,
  super_admin: ROLES.SUPER_ADMIN,
};

// ============ 可用角色计算 ============

/**
 * 根据数据库角色计算用户可以使用的前端角色列表
 * @param dbRole 数据库中存储的角色
 * @returns 用户可以切换使用的前端角色列表
 */
export function getAvailableFrontendRoles(dbRole: Role): FrontendRole[] {
  const availableRoles: FrontendRole[] = [FRONTEND_ROLES.EMPLOYEE]; // 所有人都可以是员工

  if (APPROVER_ROLES.includes(dbRole)) {
    availableRoles.push(FRONTEND_ROLES.APPROVER);
  }
  if (FINANCE_ROLES.includes(dbRole)) {
    availableRoles.push(FRONTEND_ROLES.FINANCE);
  }
  if (ADMIN_ROLES.includes(dbRole)) {
    availableRoles.push(FRONTEND_ROLES.ADMIN);
  }

  return availableRoles;
}

// ============ 邀请权限 ============

/**
 * 各角色可以邀请的角色列表
 * 规则：只能邀请同级或更低级别的角色
 */
export const INVITE_PERMISSIONS: Record<Role, Role[]> = {
  [ROLES.SUPER_ADMIN]: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.FINANCE, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  [ROLES.ADMIN]: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.FINANCE],
  [ROLES.MANAGER]: [ROLES.EMPLOYEE],
  [ROLES.FINANCE]: [ROLES.EMPLOYEE],
  [ROLES.EMPLOYEE]: [],
};

/**
 * 检查邀请人是否有权限邀请指定角色
 * @param inviterRole 邀请人的角色
 * @param targetRoles 要邀请的角色列表
 * @returns 是否有权限
 */
export function canInviteRoles(inviterRole: Role, targetRoles: Role[]): boolean {
  const allowedRoles = INVITE_PERMISSIONS[inviterRole] || [];
  return targetRoles.every(role => allowedRoles.includes(role));
}

/**
 * 从角色列表中选择最高权限的角色
 * @param roles 角色列表
 * @returns 最高权限的角色
 */
export function getHighestRole(roles: Role[]): Role {
  if (roles.length === 0) return ROLES.EMPLOYEE;

  return roles.reduce((highest, current) => {
    const currentPriority = ROLE_PRIORITY[current] || 0;
    const highestPriority = ROLE_PRIORITY[highest] || 0;
    return currentPriority > highestPriority ? current : highest;
  }, ROLES.EMPLOYEE);
}

// ============ 角色显示名称 ============

/**
 * 角色的中文显示名称
 */
export const ROLE_DISPLAY_NAMES: Record<Role | FrontendRole, string> = {
  [ROLES.EMPLOYEE]: '员工',
  [ROLES.MANAGER]: '审批人',
  [ROLES.FINANCE]: '财务',
  [ROLES.ADMIN]: '管理员',
  [ROLES.SUPER_ADMIN]: '超级管理员',
  [FRONTEND_ROLES.APPROVER]: '审批人',
};
