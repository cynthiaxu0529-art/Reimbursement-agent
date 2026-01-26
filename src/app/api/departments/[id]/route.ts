/**
 * 单个部门 API
 * GET: 获取部门详情
 * PATCH: 更新部门
 * DELETE: 删除部门
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { departments, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 获取部门详情
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '未找到租户信息' }, { status: 400 });
    }

    const department = await db.query.departments.findFirst({
      where: and(
        eq(departments.id, id),
        eq(departments.tenantId, user.tenantId)
      ),
    });

    if (!department) {
      return NextResponse.json({ error: '部门不存在' }, { status: 404 });
    }

    // 获取部门成员
    const members = await db.query.users.findMany({
      where: and(
        eq(users.tenantId, user.tenantId),
        eq(users.departmentId, id)
      ),
      columns: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
      },
    });

    // 获取部门负责人信息
    let manager = null;
    if (department.managerId) {
      manager = await db.query.users.findFirst({
        where: eq(users.id, department.managerId),
        columns: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      });
    }

    // 获取子部门
    const children = await db.query.departments.findMany({
      where: and(
        eq(departments.tenantId, user.tenantId),
        eq(departments.parentId, id),
        eq(departments.isActive, true)
      ),
    });

    // 获取父部门
    let parent = null;
    if (department.parentId) {
      parent = await db.query.departments.findFirst({
        where: eq(departments.id, department.parentId),
        columns: {
          id: true,
          name: true,
          code: true,
        },
      });
    }

    // 获取审批人信息
    const approverIds = (department.approverIds as string[]) || [];
    let approvers: Array<{ id: string; name: string; email: string }> = [];
    if (approverIds.length > 0) {
      const approverUsers = await db.query.users.findMany({
        where: eq(users.tenantId, user.tenantId),
        columns: { id: true, name: true, email: true },
      });
      approvers = approverUsers.filter(u => approverIds.includes(u.id));
    }

    return NextResponse.json({
      success: true,
      data: {
        ...department,
        manager,
        parent,
        children,
        members,
        approvers,
        memberCount: members.length,
      },
    });
  } catch (error) {
    console.error('获取部门详情失败:', error);
    return NextResponse.json(
      { error: '获取部门详情失败' },
      { status: 500 }
    );
  }
}

// 更新部门
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '未找到租户信息' }, { status: 400 });
    }

    // 检查权限
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: '无权限更新部门' }, { status: 403 });
    }

    // 检查部门是否存在
    const existing = await db.query.departments.findFirst({
      where: and(
        eq(departments.id, id),
        eq(departments.tenantId, user.tenantId)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: '部门不存在' }, { status: 404 });
    }

    const body = await request.json();
    const { name, code, description, parentId, managerId, approverIds, sortOrder, isActive } = body;

    // 如果更新名称，检查是否重复
    if (name && name !== existing.name) {
      const duplicate = await db.query.departments.findFirst({
        where: and(
          eq(departments.tenantId, user.tenantId),
          eq(departments.name, name.trim())
        ),
      });
      if (duplicate && duplicate.id !== id) {
        return NextResponse.json({ error: '部门名称已存在' }, { status: 400 });
      }
    }

    // 如果更新父部门，防止循环引用
    if (parentId !== undefined && parentId !== existing.parentId) {
      if (parentId === id) {
        return NextResponse.json({ error: '不能将部门设为自己的子部门' }, { status: 400 });
      }

      // 检查是否会形成循环
      if (parentId) {
        let current = parentId;
        while (current) {
          const parent = await db.query.departments.findFirst({
            where: eq(departments.id, current),
            columns: { parentId: true },
          });
          if (parent?.parentId === id) {
            return NextResponse.json({ error: '不能形成循环的部门层级' }, { status: 400 });
          }
          current = parent?.parentId ?? '';
        }
      }
    }

    // 计算新层级
    let level = existing.level;
    if (parentId !== undefined && parentId !== existing.parentId) {
      if (parentId) {
        const parent = await db.query.departments.findFirst({
          where: eq(departments.id, parentId),
        });
        level = (parent?.level ?? 0) + 1;
      } else {
        level = 1;
      }
    }

    // 更新部门
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (code !== undefined) updateData.code = code?.trim() || null;
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (parentId !== undefined) {
      updateData.parentId = parentId || null;
      updateData.level = level;
    }
    if (managerId !== undefined) updateData.managerId = managerId || null;
    if (approverIds !== undefined) updateData.approverIds = approverIds;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db
      .update(departments)
      .set(updateData)
      .where(eq(departments.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('更新部门失败:', error);
    return NextResponse.json(
      { error: '更新部门失败' },
      { status: 500 }
    );
  }
}

// 删除部门
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '未找到租户信息' }, { status: 400 });
    }

    // 检查权限
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: '无权限删除部门' }, { status: 403 });
    }

    // 检查部门是否存在
    const existing = await db.query.departments.findFirst({
      where: and(
        eq(departments.id, id),
        eq(departments.tenantId, user.tenantId)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: '部门不存在' }, { status: 404 });
    }

    // 检查是否有子部门
    const children = await db.query.departments.findFirst({
      where: and(
        eq(departments.tenantId, user.tenantId),
        eq(departments.parentId, id)
      ),
    });

    if (children) {
      return NextResponse.json({ error: '请先删除或迁移子部门' }, { status: 400 });
    }

    // 检查是否有成员
    const members = await db.query.users.findFirst({
      where: and(
        eq(users.tenantId, user.tenantId),
        eq(users.departmentId, id)
      ),
    });

    if (members) {
      return NextResponse.json({ error: '请先将成员迁移到其他部门' }, { status: 400 });
    }

    // 删除部门
    await db.delete(departments).where(eq(departments.id, id));

    return NextResponse.json({
      success: true,
      message: '部门已删除',
    });
  } catch (error) {
    console.error('删除部门失败:', error);
    return NextResponse.json(
      { error: '删除部门失败' },
      { status: 500 }
    );
  }
}
