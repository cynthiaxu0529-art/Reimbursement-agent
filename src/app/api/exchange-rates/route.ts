/**
 * 汇率 API
 * 统一提供汇率数据，确保前后端数据一致
 */

import { NextResponse } from 'next/server';
import { exchangeRateService, CURRENCY_INFO } from '@/lib/currency/exchange-service';
import { Currency, CurrencyType } from '@/types';

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
      if (!isValidCurrency(target)) {
        return NextResponse.json(
          { error: 'Invalid target currency code' },
          { status: 400 }
        );
      }

      const currencies = Object.values(Currency) as CurrencyType[];
      const rates: Record<string, { rate: number; source: string }> = {};

      await Promise.all(
        currencies.map(async (currency) => {
          try {
            const rateInfo = await exchangeRateService.getExchangeRate(
              currency,
              target,
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
 * 验证货币代码是否有效
 */
function isValidCurrency(code: string): code is CurrencyType {
  return Object.values(Currency).includes(code as CurrencyType);
}
