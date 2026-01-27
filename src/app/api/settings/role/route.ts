import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// 前端角色到数据库角色的映射
const ROLE_MAP: Record<string, string> = {
  employee: 'employee',
  approver: 'manager',    // 前端 "审批人" 对应数据库 "manager"
  finance: 'finance',
  admin: 'admin',
};

const VALID_ROLES = Object.keys(ROLE_MAP);

/**
 * POST /api/settings/role
 * 切换用户角色（同步到数据库）
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { role } = await request.json();

    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json({
        error: '无效的角色',
        validRoles: VALID_ROLES,
      }, { status: 400 });
    }

    const dbRole = ROLE_MAP[role];

    // 更新数据库中的角色
    const [updated] = await db
      .update(users)
      .set({
        role: dbRole as any,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.user.id))
      .returning({ role: users.role });

    return NextResponse.json({
      success: true,
      role: updated.role,
      message: `角色已切换为 ${role}`,
    });
  } catch (error) {
    console.error('Switch role error:', error);
    return NextResponse.json({ error: '切换角色失败' }, { status: 500 });
  }
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
