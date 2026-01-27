/**
 * 部门管理 API
 * GET: 获取部门列表
 * POST: 创建新部门
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
import { db } from '@/lib/db';
import { departments, users } from '@/lib/db/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';

// 获取部门列表
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 获取用户信息
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '未找到租户信息' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get('parentId');
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const flat = searchParams.get('flat') === 'true'; // 是否返回扁平列表

    // 构建查询条件
    const conditions = [eq(departments.tenantId, user.tenantId)];

    if (!includeInactive) {
      conditions.push(eq(departments.isActive, true));
    }

    if (!flat) {
      // 树形结构：只获取顶级部门或指定父部门的子部门
      if (parentId) {
        conditions.push(eq(departments.parentId, parentId));
      } else {
        conditions.push(isNull(departments.parentId));
      }
    }

    const departmentList = await db.query.departments.findMany({
      where: and(...conditions),
      orderBy: [asc(departments.level), asc(departments.sortOrder), asc(departments.name)],
    });

    // 获取每个部门的成员数量
    const departmentIds = departmentList.map(d => d.id);
    const memberCounts: Record<string, number> = {};

    if (departmentIds.length > 0) {
      const usersInDepts = await db.query.users.findMany({
        where: eq(users.tenantId, user.tenantId),
        columns: { departmentId: true },
      });

      for (const u of usersInDepts) {
        if (u.departmentId) {
          memberCounts[u.departmentId] = (memberCounts[u.departmentId] || 0) + 1;
        }
      }
    }

    // 获取部门负责人信息
    const managerIds = departmentList.map(d => d.managerId).filter(Boolean) as string[];
    const managers: Record<string, { id: string; name: string; email: string }> = {};

    if (managerIds.length > 0) {
      const managerUsers = await db.query.users.findMany({
        where: eq(users.tenantId, user.tenantId),
        columns: { id: true, name: true, email: true },
      });

      for (const m of managerUsers) {
        if (managerIds.includes(m.id)) {
          managers[m.id] = m;
        }
      }
    }

    // 组装返回数据
    const result = departmentList.map(dept => ({
      ...dept,
      memberCount: memberCounts[dept.id] || 0,
      manager: dept.managerId ? managers[dept.managerId] : null,
    }));

    // 如果需要树形结构，递归构建
    if (!flat && !parentId) {
      // 获取所有部门用于构建完整树
      const allDepts = await db.query.departments.findMany({
        where: and(
          eq(departments.tenantId, user.tenantId),
          includeInactive ? undefined : eq(departments.isActive, true)
        ),
        orderBy: [asc(departments.level), asc(departments.sortOrder), asc(departments.name)],
      });

      const buildTree = (parentId: string | null): any[] => {
        return allDepts
          .filter(d => d.parentId === parentId)
          .map(dept => ({
            ...dept,
            memberCount: memberCounts[dept.id] || 0,
            manager: dept.managerId ? managers[dept.managerId] : null,
            children: buildTree(dept.id),
          }));
      };

      return NextResponse.json({
        success: true,
        data: buildTree(null),
      });
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('获取部门列表失败:', error);
    return NextResponse.json(
      { error: '获取部门列表失败' },
      { status: 500 }
    );
  }
}

// 创建新部门
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 获取用户信息
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '未找到租户信息' }, { status: 400 });
    }

    // 检查权限（admin、super_admin、manager 可以创建部门）
    if (!['admin', 'super_admin', 'manager'].includes(user.role)) {
      return NextResponse.json({ error: '无权限创建部门' }, { status: 403 });
    }

    const body = await request.json();
    const { name, code, description, parentId, managerId, approverIds, sortOrder } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: '部门名称不能为空' }, { status: 400 });
    }

    // 检查部门名称是否已存在
    const existing = await db.query.departments.findFirst({
      where: and(
        eq(departments.tenantId, user.tenantId),
        eq(departments.name, name.trim())
      ),
    });

    if (existing) {
      return NextResponse.json({ error: '部门名称已存在' }, { status: 400 });
    }

    // 计算层级
    let level = 1;
    if (parentId) {
      const parent = await db.query.departments.findFirst({
        where: and(
          eq(departments.tenantId, user.tenantId),
          eq(departments.id, parentId)
        ),
      });
      if (parent) {
        level = parent.level + 1;
      }
    }

    // 创建部门
    const [newDept] = await db.insert(departments).values({
      tenantId: user.tenantId,
      name: name.trim(),
      code: code?.trim() || null,
      description: description?.trim() || null,
      parentId: parentId || null,
      managerId: managerId || null,
      approverIds: approverIds || [],
      level,
      sortOrder: sortOrder ?? 0,
      isActive: true,
    }).returning();

    return NextResponse.json({
      success: true,
      data: newDept,
    });
  } catch (error) {
    console.error('创建部门失败:', error);
    return NextResponse.json(
      { error: '创建部门失败' },
      { status: 500 }
    );
  }
}
