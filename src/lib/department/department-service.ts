/**
 * 部门服务层
 *
 * 提供部门数据隔离相关的核心功能：
 * - 获取用户管理的部门
 * - 获取部门层级（子部门）
 * - 部门成员查询
 * - 报销数据访问权限检查
 */

import { db } from '@/lib/db';
import { departments, users, approvalChain } from '@/lib/db/schema';
import { eq, and, inArray, or } from 'drizzle-orm';
import { getUserRoles, canApprove, canProcessPayment, isAdmin, hasAnyRole, FINANCE_ROLES, ADMIN_ROLES } from '@/lib/auth/roles';

// ============ 部门层级查询 ============

/**
 * 获取用户管理的所有部门ID
 *
 * 判断逻辑：
 * 1. 用户是部门的 managerId（部门负责人）
 * 2. 用户在部门的 approverIds 中（部门审批人）
 * 3. 用户所属的部门（departmentId）
 *
 * @param userId 用户ID
 * @param tenantId 租户ID
 * @returns 部门ID数组
 */
export async function getManagedDepartmentIds(userId: string, tenantId: string): Promise<string[]> {
  const managedDeptIds = new Set<string>();

  // 1. 查询用户作为负责人或审批人的部门
  const deptList = await db.query.departments.findMany({
    where: and(
      eq(departments.tenantId, tenantId),
      eq(departments.isActive, true)
    ),
    columns: {
      id: true,
      managerId: true,
      approverIds: true,
    },
  });

  for (const dept of deptList) {
    // 用户是部门负责人
    if (dept.managerId === userId) {
      managedDeptIds.add(dept.id);
    }
    // 用户在部门审批人列表中
    const approverIds = dept.approverIds as string[] | null;
    if (approverIds && Array.isArray(approverIds) && approverIds.includes(userId)) {
      managedDeptIds.add(dept.id);
    }
  }

  // 2. 查询用户所属的部门
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      departmentId: true,
    },
  });

  if (user?.departmentId) {
    managedDeptIds.add(user.departmentId);
  }

  return Array.from(managedDeptIds);
}

/**
 * 递归获取指定部门的所有子部门ID
 *
 * @param departmentIds 父部门ID数组
 * @param tenantId 租户ID
 * @returns 所有子部门ID数组（包括多级子部门）
 */
export async function getAllChildDepartmentIds(
  departmentIds: string[],
  tenantId: string
): Promise<string[]> {
  if (departmentIds.length === 0) {
    return [];
  }

  const allChildIds = new Set<string>();
  let currentParentIds = departmentIds;

  // 递归查询子部门（限制最大深度防止无限循环）
  const MAX_DEPTH = 10;
  let depth = 0;

  while (currentParentIds.length > 0 && depth < MAX_DEPTH) {
    const children = await db.query.departments.findMany({
      where: and(
        eq(departments.tenantId, tenantId),
        eq(departments.isActive, true),
        inArray(departments.parentId, currentParentIds)
      ),
      columns: {
        id: true,
      },
    });

    if (children.length === 0) {
      break;
    }

    const childIds = children.map(c => c.id);
    childIds.forEach(id => allChildIds.add(id));
    currentParentIds = childIds;
    depth++;
  }

  return Array.from(allChildIds);
}

/**
 * 获取用户管理的所有部门ID（包括子部门）
 *
 * @param userId 用户ID
 * @param tenantId 租户ID
 * @returns 部门ID数组（包括直接管理的部门和所有子部门）
 */
export async function getManagedDepartmentIdsWithChildren(
  userId: string,
  tenantId: string
): Promise<string[]> {
  // 获取直接管理的部门
  const directDeptIds = await getManagedDepartmentIds(userId, tenantId);

  if (directDeptIds.length === 0) {
    return [];
  }

  // 获取所有子部门
  const childDeptIds = await getAllChildDepartmentIds(directDeptIds, tenantId);

  // 合并去重
  const allDeptIds = new Set([...directDeptIds, ...childDeptIds]);
  return Array.from(allDeptIds);
}

// ============ 部门成员查询 ============

/**
 * 获取指定部门内的所有用户ID
 *
 * @param departmentIds 部门ID数组
 * @param tenantId 租户ID
 * @returns 用户ID数组
 */
export async function getDepartmentUserIds(
  departmentIds: string[],
  tenantId: string
): Promise<string[]> {
  if (departmentIds.length === 0) {
    return [];
  }

  const deptUsers = await db.query.users.findMany({
    where: and(
      eq(users.tenantId, tenantId),
      inArray(users.departmentId, departmentIds)
    ),
    columns: {
      id: true,
    },
  });

  return deptUsers.map(u => u.id);
}

// ============ 报销数据访问权限 ============

/**
 * 获取用户可以查看的报销提交人ID列表
 *
 * 权限规则：
 * - Employee: 只能看自己的
 * - Manager: 自己的 + 管理部门（含子部门）的成员
 * - Finance/Admin/Super Admin: 同租户所有用户
 *
 * @param userId 当前用户ID
 * @param tenantId 租户ID
 * @param userRoles 用户角色数组
 * @returns 可查看的用户ID数组，null 表示可以查看所有（同租户）
 */
export async function getVisibleUserIds(
  userId: string,
  tenantId: string,
  userRoles: string[]
): Promise<string[] | null> {
  // Finance/Admin/Super Admin 可以看同租户所有报销
  if (hasAnyRole(userRoles, [...FINANCE_ROLES, ...ADMIN_ROLES])) {
    return null; // null 表示不限制用户ID
  }

  // Manager 只能看自己部门（含子部门）的报销
  if (canApprove(userRoles)) {
    // 获取管理的部门（包括子部门）
    const managedDeptIds = await getManagedDepartmentIdsWithChildren(userId, tenantId);

    // 获取部门内的所有成员
    const deptUserIds = await getDepartmentUserIds(managedDeptIds, tenantId);

    // 加上自己的ID
    const visibleUserIds = new Set([...deptUserIds, userId]);
    return Array.from(visibleUserIds);
  }

  // Employee 只能看自己的
  return [userId];
}

/**
 * 检查用户是否可以查看指定报销单
 *
 * @param currentUserId 当前用户ID
 * @param reimbursementUserId 报销单提交人ID
 * @param reimbursementId 报销单ID
 * @param tenantId 租户ID
 * @param userRoles 当前用户角色数组
 * @returns 是否可以查看
 */
export async function canViewReimbursement(
  currentUserId: string,
  reimbursementUserId: string,
  reimbursementId: string,
  tenantId: string,
  userRoles: string[]
): Promise<boolean> {
  // 自己的报销，总是可以查看
  if (currentUserId === reimbursementUserId) {
    return true;
  }

  // Finance/Admin/Super Admin 可以查看同租户所有报销
  if (hasAnyRole(userRoles, [...FINANCE_ROLES, ...ADMIN_ROLES])) {
    return true;
  }

  // Manager 检查是否管理报销提交人所在的部门
  if (canApprove(userRoles)) {
    // 获取报销提交人的部门
    const submitter = await db.query.users.findFirst({
      where: eq(users.id, reimbursementUserId),
      columns: {
        departmentId: true,
      },
    });

    if (submitter?.departmentId) {
      // 获取当前用户管理的部门（包括子部门）
      const managedDeptIds = await getManagedDepartmentIdsWithChildren(currentUserId, tenantId);

      // 检查提交人部门是否在管理范围内
      if (managedDeptIds.includes(submitter.departmentId)) {
        return true;
      }
    }

    // 检查当前用户是否在该报销的审批链中
    const chainSteps = await db.query.approvalChain.findMany({
      where: and(
        eq(approvalChain.reimbursementId, reimbursementId),
        eq(approvalChain.approverId, currentUserId)
      ),
      columns: {
        id: true,
      },
    });

    if (chainSteps.length > 0) {
      return true;
    }
  }

  return false;
}

// ============ 辅助函数 ============

/**
 * 获取用户的部门信息
 *
 * @param userId 用户ID
 * @returns 部门信息（ID、名称）
 */
export async function getUserDepartment(userId: string): Promise<{
  id: string;
  name: string;
} | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      departmentId: true,
    },
  });

  if (!user?.departmentId) {
    return null;
  }

  const dept = await db.query.departments.findFirst({
    where: eq(departments.id, user.departmentId),
    columns: {
      id: true,
      name: true,
    },
  });

  return dept || null;
}

/**
 * 获取部门的层级路径
 *
 * @param departmentId 部门ID
 * @returns 从根部门到当前部门的路径
 */
export async function getDepartmentPath(departmentId: string): Promise<{
  id: string;
  name: string;
}[]> {
  const path: { id: string; name: string }[] = [];
  let currentId: string | null = departmentId;
  const MAX_DEPTH = 10;
  let depth = 0;

  while (currentId && depth < MAX_DEPTH) {
    const dept: { id: string; name: string; parentId: string | null } | undefined = await db.query.departments.findFirst({
      where: eq(departments.id, currentId),
      columns: {
        id: true,
        name: true,
        parentId: true,
      },
    });

    if (!dept) {
      break;
    }

    path.unshift({ id: dept.id, name: dept.name });
    currentId = dept.parentId;
    depth++;
  }

  return path;
}
