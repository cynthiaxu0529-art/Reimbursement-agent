/**
 * 审批规则管理 API
 * GET: 获取审批规则列表
 * POST: 创建新审批规则
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
import { db } from '@/lib/db';
import { approvalRules, users } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';

// 获取审批规则列表
export async function GET(request: NextRequest) {
  try {
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

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('activeOnly') !== 'false';

    const conditions = [eq(approvalRules.tenantId, user.tenantId)];
    if (activeOnly) {
      conditions.push(eq(approvalRules.isActive, true));
    }

    const rules = await db.query.approvalRules.findMany({
      where: and(...conditions),
      orderBy: [asc(approvalRules.priority), asc(approvalRules.name)],
    });

    return NextResponse.json({
      success: true,
      data: rules,
    });
  } catch (error) {
    console.error('获取审批规则列表失败:', error);
    return NextResponse.json(
      { error: '获取审批规则列表失败' },
      { status: 500 }
    );
  }
}

// 创建新审批规则
export async function POST(request: NextRequest) {
  try {
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
      return NextResponse.json({ error: '无权限创建审批规则' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, priority, conditions, approvalSteps, isActive, isDefault } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: '规则名称不能为空' }, { status: 400 });
    }

    if (!approvalSteps?.length) {
      return NextResponse.json({ error: '审批步骤不能为空' }, { status: 400 });
    }

    // 如果设为默认规则，取消其他默认规则
    if (isDefault) {
      await db
        .update(approvalRules)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(
          eq(approvalRules.tenantId, user.tenantId),
          eq(approvalRules.isDefault, true)
        ));
    }

    // 创建规则
    const [newRule] = await db.insert(approvalRules).values({
      tenantId: user.tenantId,
      name: name.trim(),
      description: description?.trim() || null,
      priority: priority ?? 0,
      conditions: conditions || {},
      approvalSteps: approvalSteps,
      isActive: isActive !== false,
      isDefault: isDefault === true,
    }).returning();

    return NextResponse.json({
      success: true,
      data: newRule,
    });
  } catch (error) {
    console.error('创建审批规则失败:', error);
    return NextResponse.json(
      { error: '创建审批规则失败' },
      { status: 500 }
    );
  }
}
