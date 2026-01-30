/**
 * 汇率 API
 * 统一提供汇率数据，确保前后端数据一致
 * 支持系统默认货币 + 自定义货币（从数据库读取）
 */

import { NextResponse } from 'next/server';
import { exchangeRateService, CURRENCY_INFO } from '@/lib/currency/exchange-service';
import { Currency, CurrencyType } from '@/types';
import { db } from '@/lib/db';
import { monthlyExchangeRates } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * GET /api/exchange-rates
 *
 * 查询参数：
 * - from: 源货币代码 (可选)
 * - to: 目标货币代码 (可选)
 * - target: 批量获取所有货币到目标货币的汇率 (可选)
 * - date: 指定日期的汇率，格式 YYYY-MM-DD (可选)
 *
 * 示例：
 * - /api/exchange-rates?from=CAD&to=CNY  获取单个汇率
 * - /api/exchange-rates?target=CNY       获取所有货币到 CNY 的汇率
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from') as CurrencyType | null;
  const to = searchParams.get('to') as CurrencyType | null;
  const target = searchParams.get('target') as CurrencyType | null;
  const dateStr = searchParams.get('date');

  const date = dateStr ? new Date(dateStr) : undefined;

  try {
    // 单个汇率查询: /api/exchange-rates?from=CAD&to=CNY
    if (from && to) {
      // 验证货币代码
      if (!isValidCurrency(from) || !isValidCurrency(to)) {
        return NextResponse.json(
          { error: 'Invalid currency code' },
          { status: 400 }
        );
      }

      const rate = await exchangeRateService.getExchangeRate(from, to, date);
      return NextResponse.json({
        from,
        to,
        rate: rate.rate,
        source: rate.source,
        timestamp: rate.timestamp,
      });
    }

    // 批量获取所有货币到目标货币的汇率: /api/exchange-rates?target=CNY
    if (target) {
      // target 可以是系统货币或任意 3 字母代码
      const currencies = Object.values(Currency) as CurrencyType[];
      const rates: Record<string, { rate: number; source: string }> = {};

      // 1. 获取系统默认货币的汇率
      await Promise.all(
        currencies.map(async (currency) => {
          try {
            const rateInfo = await exchangeRateService.getExchangeRate(
              currency,
              target as CurrencyType,
              date
            );
            rates[currency] = {
              rate: rateInfo.rate,
              source: rateInfo.source,
            };
          } catch (error) {
            console.error(`Failed to get rate for ${currency}:`, error);
            rates[currency] = {
              rate: 1,
              source: 'error',
            };
          }
        })
      );

      // 2. 获取数据库中的自定义货币汇率
      try {
        const now = new Date();
        const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // 查询所有手动添加的汇率
        const customRates = await db.query.monthlyExchangeRates.findMany({
          where: and(
            eq(monthlyExchangeRates.yearMonth, yearMonth),
            eq(monthlyExchangeRates.source, 'manual')
          ),
        });

        // 处理自定义汇率
        for (const customRate of customRates) {
          const fromCurrency = customRate.fromCurrency;

          // 如果是系统已支持的货币，跳过（优先使用 API 汇率）
          if (currencies.includes(fromCurrency as CurrencyType)) {
            continue;
          }

          // 如果目标货币是 CNY 且有直接汇率
          if (target === 'CNY' && customRate.toCurrency === 'CNY') {
            rates[fromCurrency] = {
              rate: customRate.rate,
              source: 'manual',
            };
          }
          // 如果目标货币是 USD 且有直接汇率
          else if (target === 'USD' && customRate.toCurrency === 'USD') {
            rates[fromCurrency] = {
              rate: customRate.rate,
              source: 'manual',
            };
          }
          // 如果需要通过 CNY 换算
          else if (customRate.toCurrency === 'CNY' && target !== 'CNY') {
            // 获取 CNY 到 target 的汇率
            const cnyToTarget = rates['CNY']?.rate || 1;
            // 计算 fromCurrency 到 target 的汇率
            // fromCurrency -> CNY -> target
            // 例如: 1 THB = 0.21 CNY, 1 CNY = 0.14 USD
            // 则 1 THB = 0.21 * 0.14 = 0.0294 USD
            rates[fromCurrency] = {
              rate: customRate.rate * cnyToTarget,
              source: 'manual_calculated',
            };
          }
        }
      } catch (dbError) {
        console.error('Failed to fetch custom rates from database:', dbError);
        // 继续返回系统默认汇率
      }

      return NextResponse.json({
        target,
        rates,
        currencyInfo: CURRENCY_INFO,
        timestamp: new Date(),
      });
    }

    // 如果没有指定参数，返回所有支持的货币信息
    return NextResponse.json({
      currencies: Object.values(Currency),
      currencyInfo: CURRENCY_INFO,
    });
  } catch (error) {
    console.error('Exchange rate API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exchange rates' },
      { status: 500 }
    );
  }
}

/**
 * 验证货币代码是否有效（系统货币）
 */
function isValidCurrency(code: string): code is CurrencyType {
  return Object.values(Currency).includes(code as CurrencyType);
}

/**
 * 验证货币代码格式是否有效（3位大写字母）
 */
function isValidCurrencyCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}
