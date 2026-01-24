import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/team/members - 获取团队成员列表
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 检查用户权限 - 只有管理员可以查看团队成员
    if (!session.user.tenantId) {
      return NextResponse.json({ error: '请先创建或加入公司' }, { status: 400 });
    }

    // 获取同一租户下的所有用户
    const members = await db.query.users.findMany({
      where: eq(users.tenantId, session.user.tenantId),
      columns: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        createdAt: true,
      },
    });

    // 转换角色格式以兼容前端
    const formattedMembers = members.map(member => ({
      id: member.id,
      name: member.name,
      email: member.email,
      roles: [member.role], // 将单一角色转为数组
      department: member.department || '未分配',
      status: 'active' as const,
      isExample: false,
    }));

    return NextResponse.json({
      success: true,
      data: formattedMembers,
    });
  } catch (error) {
    console.error('Get team members error:', error);
    return NextResponse.json(
      { error: '获取团队成员失败' },
      { status: 500 }
    );
  }
}
