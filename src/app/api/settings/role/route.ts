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
 * 获取当前数据库角色
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { role: true },
    });

    return NextResponse.json({
      success: true,
      role: user?.role || 'employee',
    });
  } catch (error) {
    console.error('Get role error:', error);
    return NextResponse.json({ error: '获取角色失败' }, { status: 500 });
  }
}
