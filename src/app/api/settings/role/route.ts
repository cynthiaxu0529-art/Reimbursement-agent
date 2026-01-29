import { NextRequest, NextResponse } from 'next/server';
import {
  auth,
  getAvailableFrontendRoles,
  canSwitchToRole,
  DB_TO_FRONTEND_ROLE,
  type Role,
  type FrontendRole,
} from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * POST /api/settings/role
 * 切换用户当前活跃角色
 *
 * 重要：这不会修改用户的原始角色(role字段)，
 * 而是将当前活跃角色存储在preferences中
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { role: targetRole } = await request.json();

    // 获取用户原始角色
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { role: true, preferences: true },
    });

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    const originalRole = user.role as Role;
    const availableRoles = getAvailableFrontendRoles(originalRole);

    // 验证用户是否有权切换到目标角色
    if (!canSwitchToRole(originalRole, targetRole as FrontendRole)) {
      return NextResponse.json({
        error: '您没有权限使用该角色',
        availableRoles,
      }, { status: 403 });
    }

    // 将活跃角色存储在preferences中（不修改原始role字段）
    const currentPreferences = (user.preferences as Record<string, unknown>) || {};
    const updatedPreferences = {
      ...currentPreferences,
      activeRole: targetRole,
    };

    await db
      .update(users)
      .set({
        preferences: updatedPreferences,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({
      success: true,
      activeRole: targetRole,
      originalRole: originalRole,
      availableRoles,
      message: `角色已切换为 ${targetRole}`,
    });
  } catch (error) {
    console.error('Switch role error:', error);
    return NextResponse.json({ error: '切换角色失败' }, { status: 500 });
  }
}

/**
 * GET /api/settings/role
 * 获取用户原始角色、当前活跃角色和可用角色列表
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { role: true, preferences: true },
    });

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    const originalRole = user.role as Role;
    const availableRoles = getAvailableFrontendRoles(originalRole);
    const preferences = (user.preferences as Record<string, unknown>) || {};

    // 获取活跃角色，如果没有设置则使用默认映射
    let activeRole = preferences.activeRole as FrontendRole | undefined;

    // 验证活跃角色是否仍然有效（用户角色可能已被降级）
    if (!activeRole || !availableRoles.includes(activeRole)) {
      activeRole = DB_TO_FRONTEND_ROLE[originalRole];
    }

    return NextResponse.json({
      success: true,
      role: originalRole,           // 原始角色（数据库中的角色）
      activeRole,                   // 当前活跃角色（前端显示用）
      availableRoles,               // 可切换的角色列表
    });
  } catch (error) {
    console.error('Get role error:', error);
    return NextResponse.json({ error: '获取角色失败' }, { status: 500 });
  }
}
