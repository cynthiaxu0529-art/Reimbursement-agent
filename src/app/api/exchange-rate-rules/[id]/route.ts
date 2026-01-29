/**
 * 单个汇率规则管理 API
 *
 * GET /api/exchange-rate-rules/[id] - 获取单个规则
 * PUT /api/exchange-rate-rules/[id] - 更新规则
 * DELETE /api/exchange-rate-rules/[id] - 删除规则
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { exchangeRateRules, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';

// 允许管理汇率规则的角色
// 注意：admin 不包含财务权限，只有 finance 和 super_admin 可以管理汇率
const ALLOWED_ROLES = ['super_admin', 'finance'];

// 检查用户是否有权限管理汇率规则
async function checkPermission(session: { user?: { id?: string } } | null) {
  if (!session?.user?.id) {
    return { error: '未登录', status: 401 };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!user) {
    return { error: '用户不存在', status: 404 };
  }

  if (!ALLOWED_ROLES.includes(user.role)) {
    return { error: '无权限管理汇率规则', status: 403 };
  }

  return { user };
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    const rule = await db
      .select()
      .from(exchangeRateRules)
      .where(eq(exchangeRateRules.id, id))
      .limit(1);

    if (rule.length === 0) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      rule: rule[0],
    });
  } catch (error) {
    console.error('Failed to fetch exchange rate rule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch rule' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    const permissionResult = await checkPermission(session);

    if ('error' in permissionResult) {
      return NextResponse.json(
        { error: permissionResult.error },
        { status: permissionResult.status }
      );
    }

    const { id } = await params;
    const body = await request.json();

    // 检查规则是否存在
    const existing = await db
      .select()
      .from(exchangeRateRules)
      .where(eq(exchangeRateRules.id, id))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    // 更新规则
    const updatedRule = await db
      .update(exchangeRateRules)
      .set({
        description: body.description ?? existing[0].description,
        source: body.source ?? existing[0].source,
        currencies: body.currencies ?? existing[0].currencies,
        fixedRates: body.fixedRates !== undefined ? body.fixedRates : existing[0].fixedRates,
        effectiveFrom: body.effectiveFrom
          ? new Date(body.effectiveFrom)
          : existing[0].effectiveFrom,
        effectiveTo: body.effectiveTo !== undefined
          ? (body.effectiveTo ? new Date(body.effectiveTo) : null)
          : existing[0].effectiveTo,
        fallbackRule: body.fallbackRule !== undefined ? body.fallbackRule : existing[0].fallbackRule,
        status: body.status ?? existing[0].status,
        priority: body.priority ?? existing[0].priority,
        updatedAt: new Date(),
      })
      .where(eq(exchangeRateRules.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      rule: updatedRule[0],
    });
  } catch (error) {
    console.error('Failed to update exchange rate rule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update rule' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    const permissionResult = await checkPermission(session);

    if ('error' in permissionResult) {
      return NextResponse.json(
        { error: permissionResult.error },
        { status: permissionResult.status }
      );
    }

    const { id } = await params;

    // 检查规则是否存在
    const existing = await db
      .select()
      .from(exchangeRateRules)
      .where(eq(exchangeRateRules.id, id))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    // 删除规则
    await db.delete(exchangeRateRules).where(eq(exchangeRateRules.id, id));

    return NextResponse.json({
      success: true,
      message: 'Rule deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete exchange rate rule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete rule' },
      { status: 500 }
    );
  }
}
