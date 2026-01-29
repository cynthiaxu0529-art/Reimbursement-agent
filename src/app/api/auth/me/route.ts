import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// 定义哪些数据库角色可以使用哪些前端角色
const APPROVER_ROLES = ['manager', 'admin', 'super_admin'];
const FINANCE_ROLES = ['finance', 'admin', 'super_admin'];

/**
 * GET /api/auth/me - 获取当前用户信息及可用角色
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 获取用户的所有角色（支持新的 roles 字段，兼容旧的 role 字段）
    const userRoles: string[] = (user as any).roles || [user.role];

    // 计算用户可以使用的前端角色
    const availableRoles = ['employee']; // 所有人都可以是员工
    if (userRoles.some(r => APPROVER_ROLES.includes(r))) {
      availableRoles.push('approver');
    }
    if (userRoles.some(r => FINANCE_ROLES.includes(r))) {
      availableRoles.push('finance');
    }
    if (userRoles.includes('admin') || userRoles.includes('super_admin')) {
      availableRoles.push('admin');
    }

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roles: userRoles,
        department: user.department,
        departmentId: user.departmentId,
        tenantId: user.tenantId,
        availableRoles,
      },
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return NextResponse.json({ error: '获取用户信息失败' }, { status: 500 });
  }
}
