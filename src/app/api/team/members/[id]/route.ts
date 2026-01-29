import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, departments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/team/members/[id] - 更新成员信息（部门、角色等）
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!currentUser?.tenantId) {
      return NextResponse.json({ error: '未找到租户信息' }, { status: 400 });
    }

    // 只有管理员可以修改成员信息（支持多角色）
    const currentUserRoles: string[] = (currentUser as any).roles || [currentUser.role];
    const isAdmin = currentUserRoles.includes('admin') || currentUserRoles.includes('super_admin');
    if (!isAdmin) {
      return NextResponse.json({ error: '无权限修改成员信息' }, { status: 403 });
    }

    // 检查目标用户是否存在且属于同一租户
    const targetUser = await db.query.users.findFirst({
      where: and(
        eq(users.id, id),
        eq(users.tenantId, currentUser.tenantId)
      ),
    });

    if (!targetUser) {
      return NextResponse.json({ error: '成员不存在' }, { status: 404 });
    }

    const body = await request.json();
    const { departmentId, role, roles } = body;

    const updateData: Record<string, unknown> = {};
    const validRoles = ['employee', 'manager', 'finance', 'admin', 'super_admin'];

    // 角色优先级用于确定主要角色
    const rolePriority: Record<string, number> = {
      employee: 1,
      manager: 2,
      finance: 3,
      admin: 4,
      super_admin: 5,
    };

    // 更新部门
    if (departmentId !== undefined) {
      if (departmentId) {
        // 验证部门存在且属于同一租户
        const dept = await db.query.departments.findFirst({
          where: and(
            eq(departments.id, departmentId),
            eq(departments.tenantId, currentUser.tenantId)
          ),
        });
        if (!dept) {
          return NextResponse.json({ error: '部门不存在' }, { status: 400 });
        }
        updateData.departmentId = departmentId;
        updateData.department = dept.name;
      } else {
        // 清除部门
        updateData.departmentId = null;
        updateData.department = null;
      }
    }

    // 更新角色 - 支持多角色
    if (roles !== undefined && Array.isArray(roles)) {
      // 验证所有角色有效
      const invalidRoles = roles.filter(r => !validRoles.includes(r));
      if (invalidRoles.length > 0) {
        return NextResponse.json({ error: `无效的角色: ${invalidRoles.join(', ')}` }, { status: 400 });
      }
      if (roles.length === 0) {
        return NextResponse.json({ error: '至少需要一个角色' }, { status: 400 });
      }
      updateData.roles = roles;
      // 自动设置主要角色为权限最高的
      const primaryRole = roles.reduce((highest, current) => {
        return (rolePriority[current] || 0) > (rolePriority[highest] || 0) ? current : highest;
      }, roles[0]);
      updateData.role = primaryRole;
    } else if (role !== undefined) {
      // 兼容旧的单角色更新
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: '无效的角色' }, { status: 400 });
      }
      updateData.role = role;
      updateData.roles = [role]; // 同步更新 roles 数组
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '没有需要更新的字段' }, { status: 400 });
    }

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        department: users.department,
        departmentId: users.departmentId,
      });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('更新成员信息失败:', error);
    return NextResponse.json(
      { error: '更新成员信息失败' },
      { status: 500 }
    );
  }
}
