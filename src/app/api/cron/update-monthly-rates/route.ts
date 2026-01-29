/**
 * 月初汇率更新 Cron API
 *
 * 建议在每月 1 日 00:05 (UTC) 调用此接口
 * 例如：在 Vercel 中设置 cron job 或使用外部 cron 服务
 *
 * 用法：
 * GET /api/cron/update-monthly-rates
 * Header: Authorization: Bearer <CRON_SECRET>
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { monthlyExchangeRates } from '@/lib/db/schema';
import {
  exchangeRateService,
  updateFallbackRates,
} from '@/lib/currency/exchange-service';
import { Currency, CurrencyType } from '@/types';
import { eq, and } from 'drizzle-orm';

export async function GET(request: Request) {
  // 验证 cron secret（安全措施）
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const baseCurrency: CurrencyType = Currency.CNY;

    const currencies = Object.values(Currency) as CurrencyType[];
    const results: Array<{
      currency: string;
      rate: number;
      source: string;
      status: 'success' | 'error';
      error?: string;
    }> = [];

    for (const currency of currencies) {
      if (currency === baseCurrency) {
        results.push({
          currency,
          rate: 1,
          source: 'identity',
          status: 'success',
        });
        continue;
      }

      try {
        // 先清除月初缓存，强制从 API 获取最新汇率
        exchangeRateService.clearMonthlyRateCache();

        // 从 API 获取最新汇率
        const rateInfo = await exchangeRateService.getExchangeRate(currency, baseCurrency);

        // 检查是否已存在当月记录
        const existing = await db.query.monthlyExchangeRates.findFirst({
          where: and(
            eq(monthlyExchangeRates.yearMonth, yearMonth),
            eq(monthlyExchangeRates.fromCurrency, currency),
            eq(monthlyExchangeRates.toCurrency, baseCurrency)
          ),
        });

        if (existing) {
          // 更新现有记录
          await db
            .update(monthlyExchangeRates)
            .set({
              rate: rateInfo.rate,
              source: rateInfo.source,
              rateDate: now,
            })
            .where(eq(monthlyExchangeRates.id, existing.id));
        } else {
          // 插入新记录
          await db.insert(monthlyExchangeRates).values({
            yearMonth,
            fromCurrency: currency,
            toCurrency: baseCurrency,
            rate: rateInfo.rate,
            source: rateInfo.source,
            rateDate: now,
          });
        }

        // 设置月初汇率缓存
        exchangeRateService.setMonthlyRate(
          yearMonth,
          currency,
          baseCurrency,
          rateInfo.rate,
          rateInfo.source
        );

        results.push({
          currency,
          rate: rateInfo.rate,
          source: rateInfo.source,
          status: 'success',
        });
      } catch (error) {
        console.error(`Failed to update rate for ${currency}:`, error);
        results.push({
          currency,
          rate: 0,
          source: 'error',
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length;
    const errorCount = results.filter((r) => r.status === 'error').length;

    // 同时更新备用汇率（用成功获取的汇率更新动态备用汇率）
    const fallbackRates: Record<CurrencyType, number> = {} as Record<CurrencyType, number>;
    for (const result of results) {
      if (result.status === 'success' && result.rate > 0) {
        fallbackRates[result.currency as CurrencyType] = result.rate;
      }
    }
    if (Object.keys(fallbackRates).length > 0) {
      updateFallbackRates(fallbackRates);
    }

    return NextResponse.json({
      success: true,
      message: `Monthly rates updated for ${yearMonth}`,
      yearMonth,
      baseCurrency,
      summary: {
        total: results.length,
        success: successCount,
        error: errorCount,
      },
      rates: results,
      fallbackRatesUpdated: Object.keys(fallbackRates).length,
    });
  } catch (error) {
    console.error('Monthly rate update failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update monthly rates',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
