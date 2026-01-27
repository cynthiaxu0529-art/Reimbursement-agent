/**
 * 单个审批规则 API
 * GET: 获取规则详情
 * PATCH: 更新规则
 * DELETE: 删除规则
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { approvalRules, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 获取规则详情
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '未找到租户信息' }, { status: 400 });
    }

    const rule = await db.query.approvalRules.findFirst({
      where: and(
        eq(approvalRules.id, id),
        eq(approvalRules.tenantId, user.tenantId)
      ),
    });

    if (!rule) {
      return NextResponse.json({ error: '规则不存在' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    console.error('获取审批规则详情失败:', error);
    return NextResponse.json(
      { error: '获取审批规则详情失败' },
      { status: 500 }
    );
  }
}

// 更新规则
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await auth();

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
      return NextResponse.json({ error: '无权限更新审批规则' }, { status: 403 });
    }

    const existing = await db.query.approvalRules.findFirst({
      where: and(
        eq(approvalRules.id, id),
        eq(approvalRules.tenantId, user.tenantId)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: '规则不存在' }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, priority, conditions, approvalSteps, isActive, isDefault } = body;

    // 如果设为默认规则，取消其他默认规则
    if (isDefault && !existing.isDefault) {
      await db
        .update(approvalRules)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(
          eq(approvalRules.tenantId, user.tenantId),
          eq(approvalRules.isDefault, true)
        ));
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (priority !== undefined) updateData.priority = priority;
    if (conditions !== undefined) updateData.conditions = conditions;
    if (approvalSteps !== undefined) updateData.approvalSteps = approvalSteps;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isDefault !== undefined) updateData.isDefault = isDefault;

    const [updated] = await db
      .update(approvalRules)
      .set(updateData)
      .where(eq(approvalRules.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('更新审批规则失败:', error);
    return NextResponse.json(
      { error: '更新审批规则失败' },
      { status: 500 }
    );
  }
}

// 删除规则
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await auth();

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
      return NextResponse.json({ error: '无权限删除审批规则' }, { status: 403 });
    }

    const existing = await db.query.approvalRules.findFirst({
      where: and(
        eq(approvalRules.id, id),
        eq(approvalRules.tenantId, user.tenantId)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: '规则不存在' }, { status: 404 });
    }

    // 不允许删除默认规则
    if (existing.isDefault) {
      return NextResponse.json({ error: '不能删除默认规则，请先设置其他规则为默认' }, { status: 400 });
    }

    await db.delete(approvalRules).where(eq(approvalRules.id, id));

    return NextResponse.json({
      success: true,
      message: '规则已删除',
    });
  } catch (error) {
    console.error('删除审批规则失败:', error);
    return NextResponse.json(
      { error: '删除审批规则失败' },
      { status: 500 }
    );
  }
}
