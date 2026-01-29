/**
 * 权限检查函数
 *
 * 提供统一的权限验证逻辑，用于API和前端
 */

import {
  Role,
  FrontendRole,
  APPROVER_ROLES,
  FINANCE_ROLES,
  ADMIN_ROLES,
  ROLES,
  getAvailableFrontendRoles,
} from './roles';

// ============ 基础权限检查 ============

/**
 * 检查是否有审批权限
 */
export function hasApproverPermission(role: Role | string): boolean {
  return APPROVER_ROLES.includes(role as Role);
}

/**
 * 检查是否有财务权限
 */
export function hasFinancePermission(role: Role | string): boolean {
  return FINANCE_ROLES.includes(role as Role);
}

/**
 * 检查是否有管理员权限
 */
export function hasAdminPermission(role: Role | string): boolean {
  return ADMIN_ROLES.includes(role as Role);
}

/**
 * 检查是否是超级管理员
 */
export function isSuperAdmin(role: Role | string): boolean {
  return role === ROLES.SUPER_ADMIN;
}

// ============ 角色切换权限检查 ============

/**
 * 检查用户是否可以切换到指定的前端角色
 * @param dbRole 用户数据库中的角色
 * @param targetFrontendRole 目标前端角色
 * @returns 是否允许切换
 */
export function canSwitchToRole(dbRole: Role, targetFrontendRole: FrontendRole): boolean {
  const availableRoles = getAvailableFrontendRoles(dbRole);
  return availableRoles.includes(targetFrontendRole);
}

// ============ 功能权限检查 ============

/**
 * 权限类型定义
 */
export type Permission =
  | 'submit_reimbursement'      // 提交报销
  | 'view_own_reimbursement'    // 查看自己的报销
  | 'approve_reimbursement'     // 审批报销
  | 'view_team_reimbursement'   // 查看团队报销
  | 'process_payment'           // 处理付款
  | 'view_all_reimbursement'    // 查看所有报销
  | 'manage_team'               // 管理团队
  | 'manage_departments'        // 管理部门
  | 'manage_settings'           // 管理系统设置
  | 'invite_users'              // 邀请用户
  | 'manage_approval_rules'     // 管理审批规则
  | 'view_audit_logs'           // 查看审计日志
  | 'manage_exchange_rates';    // 管理汇率

/**
 * 角色对应的权限列表
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [ROLES.EMPLOYEE]: [
    'submit_reimbursement',
    'view_own_reimbursement',
  ],
  [ROLES.MANAGER]: [
    'submit_reimbursement',
    'view_own_reimbursement',
    'approve_reimbursement',
    'view_team_reimbursement',
    'invite_users',
  ],
  [ROLES.FINANCE]: [
    'submit_reimbursement',
    'view_own_reimbursement',
    'process_payment',
    'view_all_reimbursement',
    'manage_exchange_rates',
  ],
  [ROLES.ADMIN]: [
    'submit_reimbursement',
    'view_own_reimbursement',
    'approve_reimbursement',
    'view_team_reimbursement',
    'process_payment',
    'view_all_reimbursement',
    'manage_team',
    'manage_departments',
    'manage_settings',
    'invite_users',
    'manage_approval_rules',
    'manage_exchange_rates',
  ],
  [ROLES.SUPER_ADMIN]: [
    'submit_reimbursement',
    'view_own_reimbursement',
    'approve_reimbursement',
    'view_team_reimbursement',
    'process_payment',
    'view_all_reimbursement',
    'manage_team',
    'manage_departments',
    'manage_settings',
    'invite_users',
    'manage_approval_rules',
    'view_audit_logs',
    'manage_exchange_rates',
  ],
};

/**
 * 检查角色是否拥有指定权限
 * @param role 用户角色
 * @param permission 要检查的权限
 * @returns 是否拥有权限
 */
export function hasPermission(role: Role | string, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role as Role];
  if (!permissions) return false;
  return permissions.includes(permission);
}

/**
 * 获取角色的所有权限
 * @param role 用户角色
 * @returns 权限列表
 */
export function getRolePermissions(role: Role | string): Permission[] {
  return ROLE_PERMISSIONS[role as Role] || [];
}

// ============ API权限验证辅助函数 ============

export interface PermissionCheckResult {
  allowed: boolean;
  error?: string;
  statusCode?: number;
}

/**
 * 验证审批权限
 */
export function checkApproverPermission(role: string): PermissionCheckResult {
  if (!hasApproverPermission(role)) {
    return {
      allowed: false,
      error: '无审批权限',
      statusCode: 403,
    };
  }
  return { allowed: true };
}

/**
 * 验证财务权限
 */
export function checkFinancePermission(role: string): PermissionCheckResult {
  if (!hasFinancePermission(role)) {
    return {
      allowed: false,
      error: '无财务权限',
      statusCode: 403,
    };
  }
  return { allowed: true };
}

/**
 * 验证管理员权限
 */
export function checkAdminPermission(role: string): PermissionCheckResult {
  if (!hasAdminPermission(role)) {
    return {
      allowed: false,
      error: '无管理员权限',
      statusCode: 403,
    };
  }
  return { allowed: true };
}

/**
 * 验证指定权限
 */
export function checkPermission(role: string, permission: Permission): PermissionCheckResult {
  if (!hasPermission(role, permission)) {
    return {
      allowed: false,
      error: `无${permission}权限`,
      statusCode: 403,
    };
  }
  return { allowed: true };
}
