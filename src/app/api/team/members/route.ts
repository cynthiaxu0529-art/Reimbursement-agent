import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, departments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

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
        departmentId: true,
        createdAt: true,
      },
    });

    // 获取所有部门用于名称查找
    const deptList = await db.query.departments.findMany({
      where: eq(departments.tenantId, session.user.tenantId),
      columns: { id: true, name: true },
    });
    const deptMap = new Map(deptList.map(d => [d.id, d.name]));

    // 转换角色格式以兼容前端
    const formattedMembers = members.map(member => {
      // 优先使用 departmentId 查找部门名称，其次使用 department 文本字段
      let deptName = member.department;
      if (!deptName && member.departmentId) {
        deptName = deptMap.get(member.departmentId) || null;
      }

      return {
        id: member.id,
        name: member.name,
        email: member.email,
        roles: [member.role], // 将单一角色转为数组
        department: deptName || '未分配',
        departmentId: member.departmentId || undefined,
        status: 'active' as const,
        isExample: false,
      };
    });

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
