/**
 * 汇率规则管理 API
 *
 * GET /api/exchange-rate-rules - 获取所有汇率规则
 * POST /api/exchange-rate-rules - 创建新规则
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { exchangeRateRules, users } from '@/lib/db/schema';
import { eq, desc, and, or, isNull } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const tenantId = searchParams.get('tenantId');

    // 构建查询条件
    const conditions = [];

    if (status && status !== 'all') {
      conditions.push(eq(exchangeRateRules.status, status));
    }

    // 获取全局规则或特定租户的规则
    if (tenantId) {
      conditions.push(
        or(
          eq(exchangeRateRules.tenantId, tenantId),
          isNull(exchangeRateRules.tenantId)
        )
      );
    }

    const rules = await db
      .select()
      .from(exchangeRateRules)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(exchangeRateRules.createdAt));

    return NextResponse.json({
      success: true,
      rules: rules.map((rule) => ({
        id: rule.id,
        description: rule.description,
        source: rule.source,
        currencies: rule.currencies,
        fixedRates: rule.fixedRates,
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo,
        fallbackRule: rule.fallbackRule,
        status: rule.status,
        priority: rule.priority,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch exchange rate rules:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch rules' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 获取用户信息，检查角色权限
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 只有 super_admin 和 finance 角色可以管理汇率规则
    // 注意：admin 不包含财务权限
    const allowedRoles = ['super_admin', 'finance'];
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json({ error: '无权限管理汇率规则，需要财务或超级管理员角色' }, { status: 403 });
    }

    const body = await request.json();

    // 验证必填字段
    if (!body.description || !body.source || !body.effectiveFrom) {
      return NextResponse.json(
        { error: 'Missing required fields: description, source, effectiveFrom' },
        { status: 400 }
      );
    }

    const newRule = await db
      .insert(exchangeRateRules)
      .values({
        tenantId: user.tenantId || null,
        description: body.description,
        source: body.source,
        currencies: body.currencies || [],
        fixedRates: body.fixedRates || null,
        effectiveFrom: new Date(body.effectiveFrom),
        effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
        fallbackRule: body.fallbackRule || null,
        status: body.status || 'draft',
        priority: body.priority || 0,
        createdBy: user.id,
      })
      .returning();

    return NextResponse.json({
      success: true,
      rule: newRule[0],
    });
  } catch (error) {
    console.error('Failed to create exchange rate rule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create rule' },
      { status: 500 }
    );
  }
}
