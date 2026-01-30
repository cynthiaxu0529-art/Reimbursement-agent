/**
 * 自定义货币汇率管理 API
 *
 * 允许财务人员手动添加或更新货币汇率
 * 用于支持系统默认不包含的货币（如 THB、MYR 等）
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, monthlyExchangeRates } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { CurrencyType, Currency } from '@/types';

// 标记为动态路由
export const dynamic = 'force-dynamic';

/**
 * 验证货币代码格式（3位大写字母）
 */
function isValidCurrencyCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

/**
 * GET /api/exchange-rates/custom - 获取自定义货币汇率列表
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 获取当前年月
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 查询当月的自定义汇率（source = 'manual'）
    const customRates = await db.query.monthlyExchangeRates.findMany({
      where: and(
        eq(monthlyExchangeRates.yearMonth, yearMonth),
        eq(monthlyExchangeRates.source, 'manual')
      ),
    });

    return NextResponse.json({
      success: true,
      yearMonth,
      rates: customRates.map(rate => ({
        id: rate.id,
        fromCurrency: rate.fromCurrency,
        toCurrency: rate.toCurrency,
        rate: rate.rate,
        source: rate.source,
        rateDate: rate.rateDate,
        createdAt: rate.createdAt,
      })),
    });
  } catch (error) {
    console.error('获取自定义汇率失败:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}

/**
 * POST /api/exchange-rates/custom - 添加或更新自定义货币汇率
 *
 * Body:
 * {
 *   currency: string,     // 货币代码（如 "THB"）
 *   rateToCNY: number,    // 到人民币的汇率（如 1 THB = 0.21 CNY）
 *   rateToUSD?: number,   // 可选：到美元的汇率
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 检查权限 - 只有 finance 或 admin 可以操作
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user || !['finance', 'admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: '无权限操作' }, { status: 403 });
    }

    const body = await request.json();
    const { currency, rateToCNY, rateToUSD } = body;

    // 验证参数
    if (!currency || !isValidCurrencyCode(currency)) {
      return NextResponse.json({
        error: '货币代码无效，必须是3位大写字母（如 THB、MYR）'
      }, { status: 400 });
    }

    if (!rateToCNY || typeof rateToCNY !== 'number' || rateToCNY <= 0) {
      return NextResponse.json({
        error: '汇率无效，必须是正数'
      }, { status: 400 });
    }

    // 获取当前年月
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 检查是否已存在该货币的汇率
    const existing = await db.query.monthlyExchangeRates.findFirst({
      where: and(
        eq(monthlyExchangeRates.yearMonth, yearMonth),
        eq(monthlyExchangeRates.fromCurrency, currency),
        eq(monthlyExchangeRates.toCurrency, 'CNY')
      ),
    });

    if (existing) {
      // 更新现有汇率
      await db
        .update(monthlyExchangeRates)
        .set({
          rate: rateToCNY,
          source: 'manual',
          rateDate: now,
        })
        .where(eq(monthlyExchangeRates.id, existing.id));
    } else {
      // 插入新汇率
      await db.insert(monthlyExchangeRates).values({
        yearMonth,
        fromCurrency: currency,
        toCurrency: 'CNY',
        rate: rateToCNY,
        source: 'manual',
        rateDate: now,
        createdAt: now,
      });
    }

    // 如果提供了 USD 汇率，也保存
    if (rateToUSD && typeof rateToUSD === 'number' && rateToUSD > 0) {
      const existingUSD = await db.query.monthlyExchangeRates.findFirst({
        where: and(
          eq(monthlyExchangeRates.yearMonth, yearMonth),
          eq(monthlyExchangeRates.fromCurrency, currency),
          eq(monthlyExchangeRates.toCurrency, 'USD')
        ),
      });

      if (existingUSD) {
        await db
          .update(monthlyExchangeRates)
          .set({
            rate: rateToUSD,
            source: 'manual',
            rateDate: now,
          })
          .where(eq(monthlyExchangeRates.id, existingUSD.id));
      } else {
        await db.insert(monthlyExchangeRates).values({
          yearMonth,
          fromCurrency: currency,
          toCurrency: 'USD',
          rate: rateToUSD,
          source: 'manual',
          rateDate: now,
          createdAt: now,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `货币 ${currency} 汇率已${existing ? '更新' : '添加'}`,
      data: {
        currency,
        rateToCNY,
        rateToUSD: rateToUSD || null,
        yearMonth,
      },
    });
  } catch (error) {
    console.error('保存自定义汇率失败:', error);
    return NextResponse.json({ error: '保存失败' }, { status: 500 });
  }
}

/**
 * DELETE /api/exchange-rates/custom - 删除自定义货币汇率
 *
 * Query: ?currency=THB
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 检查权限
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user || !['finance', 'admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: '无权限操作' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const currency = searchParams.get('currency');

    if (!currency) {
      return NextResponse.json({ error: '缺少货币代码' }, { status: 400 });
    }

    // 获取当前年月
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 删除该货币的所有手动汇率
    await db
      .delete(monthlyExchangeRates)
      .where(
        and(
          eq(monthlyExchangeRates.yearMonth, yearMonth),
          eq(monthlyExchangeRates.fromCurrency, currency),
          eq(monthlyExchangeRates.source, 'manual')
        )
      );

    return NextResponse.json({
      success: true,
      message: `货币 ${currency} 的自定义汇率已删除`,
    });
  } catch (error) {
    console.error('删除自定义汇率失败:', error);
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
