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

    // 获取 roles 数组，如果不存在则从 role 字段生成
    const roles: string[] = (user?.roles as string[]) || [user?.role || 'employee'];

    // 确保 roles 数组至少包含 employee
    if (!roles.includes('employee')) {
      roles.unshift('employee');
    }

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
