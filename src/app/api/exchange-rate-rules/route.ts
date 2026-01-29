/**
 * 汇率规则管理 API
 *
 * GET /api/exchange-rate-rules - 获取所有汇率规则
 * POST /api/exchange-rate-rules - 创建新规则
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { exchangeRateRules } from '@/lib/db/schema';
import { eq, desc, and, or, isNull } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';

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
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
        tenantId: body.tenantId || null,
        description: body.description,
        source: body.source,
        currencies: body.currencies || [],
        fixedRates: body.fixedRates || null,
        effectiveFrom: new Date(body.effectiveFrom),
        effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
        fallbackRule: body.fallbackRule || null,
        status: body.status || 'draft',
        priority: body.priority || 0,
        createdBy: (session.user as { id?: string }).id || null,
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
