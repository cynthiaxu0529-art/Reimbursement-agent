/**
 * 角色权限辅助工具
 * 支持多角色权限检查
 */

// 可以审批的角色
export const APPROVER_ROLES = ['manager', 'admin', 'super_admin'];

// 可以处理财务的角色
export const FINANCE_ROLES = ['finance', 'admin', 'super_admin'];

// 可以管理团队的角色
export const ADMIN_ROLES = ['admin', 'super_admin'];

/**
 * 从用户对象获取 roles 数组
 * 兼容旧的 role 单字段和新的 roles 数组
 */
export function getUserRoles(user: { role?: string; roles?: string[] | unknown }): string[] {
  if (user.roles && Array.isArray(user.roles) && user.roles.length > 0) {
    return user.roles as string[];
  }
  // 降级到单个 role
  return user.role ? [user.role] : ['employee'];
}

/**
 * 检查用户是否拥有指定角色之一
 */
export function hasAnyRole(userRoles: string[], requiredRoles: string[]): boolean {
  return userRoles.some(role => requiredRoles.includes(role));
}

/**
 * 检查用户是否有审批权限
 */
export function canApprove(userRoles: string[]): boolean {
  return hasAnyRole(userRoles, APPROVER_ROLES);
}

/**
 * 检查用户是否有财务权限
 */
export function canProcessPayment(userRoles: string[]): boolean {
  return hasAnyRole(userRoles, FINANCE_ROLES);
}

/**
 * 检查用户是否有管理员权限
 */
export function isAdmin(userRoles: string[]): boolean {
  return hasAnyRole(userRoles, ADMIN_ROLES);
}

/**
 * 检查用户是否有员工权限（可以提交报销）
 */
export function canSubmitReimbursement(userRoles: string[]): boolean {
  return userRoles.includes('employee') || isAdmin(userRoles);
}
