import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, departments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserRoles, isAdmin } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/**
 * GET /api/team/members - 获取团队成员列表
 * 权限：仅 admin 和 super_admin 可以访问
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    if (!session.user.tenantId) {
      return NextResponse.json({ error: '请先创建或加入公司' }, { status: 400 });
    }

    // 获取当前用户角色并检查管理员权限
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { role: true, roles: true },
    });

    const userRoles = getUserRoles(currentUser || {});
    if (!isAdmin(userRoles)) {
      return NextResponse.json({ error: '无权限查看团队成员，需要管理员角色' }, { status: 403 });
    }

    // 获取同一租户下的所有用户
    const members = await db.query.users.findMany({
      where: eq(users.tenantId, session.user.tenantId),
    });

    // 获取所有部门用于名称查找
    const deptList = await db.query.departments.findMany({
      where: eq(departments.tenantId, session.user.tenantId),
      columns: { id: true, name: true },
    });
    const deptMap = new Map(deptList.map(d => [d.id, d.name]));

    // 转换角色格式以兼容前端
    const formattedMembers = members.map(member => {
      // 优先使用 departmentId 查找部门名称（更可靠），其次使用 department 文本字段
      let deptName: string | null = null;
      if (member.departmentId) {
        deptName = deptMap.get(member.departmentId) || null;
      }
      if (!deptName && member.department) {
        deptName = member.department;
      }

      return {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        roles: [member.role], // 兼容前端多角色显示
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
