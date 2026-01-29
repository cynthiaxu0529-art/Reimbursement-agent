import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserRoles, isAdmin, ADMIN_ROLES } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

// 允许分配的角色列表
const ASSIGNABLE_ROLES = ['employee', 'manager', 'finance', 'admin'];

/**
 * GET /api/admin/users/[id]/roles
 * 获取指定用户的角色
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id: targetUserId } = await params;

    // 检查当前用户是否有管理员权限
    const [currentUser] = await db.select({ role: users.role, roles: users.roles, tenantId: users.tenantId })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const currentUserRoles = getUserRoles(currentUser || {});
    if (!isAdmin(currentUserRoles)) {
      return NextResponse.json({ error: '无权限，需要管理员角色' }, { status: 403 });
    }

    // 获取目标用户
    const [targetUser] = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      roles: users.roles,
      tenantId: users.tenantId,
    })
      .from(users)
      .where(and(
        eq(users.id, targetUserId),
        eq(users.tenantId, currentUser.tenantId!) // 只能管理同租户用户
      ))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json({ error: '用户不存在或无权访问' }, { status: 404 });
    }

    const targetRoles = getUserRoles(targetUser);

    return NextResponse.json({
      success: true,
      data: {
        userId: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        roles: targetRoles,
        primaryRole: targetUser.role,
      },
    });
  } catch (error) {
    console.error('Get user roles error:', error);
    return NextResponse.json({ error: '获取用户角色失败' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/users/[id]/roles
 * 更新用户角色（管理员专用）
 * Body: { roles: ['employee', 'manager'] }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id: targetUserId } = await params;
    const { roles: newRoles } = await request.json();

    // 验证角色数组
    if (!Array.isArray(newRoles) || newRoles.length === 0) {
      return NextResponse.json({ error: '角色数组不能为空' }, { status: 400 });
    }

    // 确保所有角色都是有效的
    const invalidRoles = newRoles.filter(r => !ASSIGNABLE_ROLES.includes(r));
    if (invalidRoles.length > 0) {
      return NextResponse.json({
        error: `无效的角色: ${invalidRoles.join(', ')}`,
        validRoles: ASSIGNABLE_ROLES,
      }, { status: 400 });
    }

    // 检查当前用户是否有管理员权限
    const [currentUser] = await db.select({ role: users.role, roles: users.roles, tenantId: users.tenantId })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const currentUserRoles = getUserRoles(currentUser || {});
    if (!isAdmin(currentUserRoles)) {
      return NextResponse.json({ error: '无权限，需要管理员角色' }, { status: 403 });
    }

    // 获取目标用户（确保是同租户）
    const [targetUser] = await db.select({ id: users.id, role: users.role, tenantId: users.tenantId })
      .from(users)
      .where(and(
        eq(users.id, targetUserId),
        eq(users.tenantId, currentUser.tenantId!)
      ))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json({ error: '用户不存在或无权访问' }, { status: 404 });
    }

    // 不能修改自己的角色（防止管理员误操作把自己降级）
    if (targetUserId === session.user.id) {
      return NextResponse.json({ error: '不能修改自己的角色' }, { status: 400 });
    }

    // 不能给普通用户分配 super_admin 角色
    if (newRoles.includes('super_admin') && !currentUserRoles.includes('super_admin')) {
      return NextResponse.json({ error: '只有超级管理员可以分配 super_admin 角色' }, { status: 403 });
    }

    // 确保 roles 数组去重
    const uniqueRoles = [...new Set(newRoles)];

    // 确定主要角色（优先级：admin > finance > manager > employee）
    const primaryRole = uniqueRoles.includes('admin') ? 'admin'
      : uniqueRoles.includes('finance') ? 'finance'
      : uniqueRoles.includes('manager') ? 'manager'
      : 'employee';

    // 更新用户角色
    await db.update(users)
      .set({
        role: primaryRole as any,
        roles: uniqueRoles,
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetUserId));

    return NextResponse.json({
      success: true,
      message: '角色更新成功',
      data: {
        userId: targetUserId,
        roles: uniqueRoles,
        primaryRole,
      },
    });
  } catch (error) {
    console.error('Update user roles error:', error);
    return NextResponse.json({ error: '更新用户角色失败' }, { status: 500 });
  }
}
