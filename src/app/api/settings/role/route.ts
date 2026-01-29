import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * POST /api/settings/role
 * 角色切换功能已禁用 - 用户角色由管理员在后台分配，不允许自行切换
 */
export async function POST() {
  return NextResponse.json({
    error: '角色切换功能已禁用。如需更改角色，请联系管理员。',
  }, { status: 403 });
}

/**
 * GET /api/settings/role
 * 获取当前用户的角色信息（支持多角色）
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { role: true, roles: true },
    });

    // 获取 roles 数组
    // 核心逻辑：合并 roles 数组和 role 字段，确保不丢失任何权限
    let roles: string[] = [];

    // 1. 从 roles 字段获取
    if (user?.roles && Array.isArray(user.roles) && user.roles.length > 0) {
      roles = [...(user.roles as string[])];
    }

    // 2. 确保 role 字段的值也在 roles 数组中（防止迁移遗漏）
    // 这是关键修复：即使 roles 数组存在，也要检查 role 字段
    if (user?.role && !roles.includes(user.role)) {
      roles.push(user.role);
    }

    // 3. 如果都没有，默认为 employee
    if (roles.length === 0) {
      roles = ['employee'];
    }

    // 4. 确保 roles 数组至少包含 employee（所有人都应该能提交报销）
    if (!roles.includes('employee')) {
      roles.unshift('employee');
    }

    console.log('User roles API response:', { userId: session.user.id, role: user?.role, roles });

    return NextResponse.json({
      success: true,
      role: user?.role || 'employee',  // 保留兼容
      roles: roles,                     // 多角色数组
    });
  } catch (error) {
    console.error('Get role error:', error);
    return NextResponse.json({ error: '获取角色失败' }, { status: 500 });
  }
}
