/**
 * 货币汇率转换服务
 * 支持将发票币种转换为公司记账本位币
 */

import type {
  CurrencyType,
  CurrencyConversionRequest,
  CurrencyConversionResponse,
  ExchangeRate,
} from '@/types';
import { Currency } from '@/types';

// 缓存汇率数据
const rateCache: Map<string, { rate: ExchangeRate; expiry: Date }> = new Map();
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 小时缓存

/**
 * 货币信息
 */
export const CURRENCY_INFO: Record<
  CurrencyType,
  { symbol: string; name: string; nameEn: string; decimals: number }
> = {
  CNY: { symbol: '¥', name: '人民币', nameEn: 'Chinese Yuan', decimals: 2 },
  USD: { symbol: '$', name: '美元', nameEn: 'US Dollar', decimals: 2 },
  EUR: { symbol: '€', name: '欧元', nameEn: 'Euro', decimals: 2 },
  GBP: { symbol: '£', name: '英镑', nameEn: 'British Pound', decimals: 2 },
  JPY: { symbol: '¥', name: '日元', nameEn: 'Japanese Yen', decimals: 0 },
  HKD: { symbol: 'HK$', name: '港币', nameEn: 'Hong Kong Dollar', decimals: 2 },
  SGD: { symbol: 'S$', name: '新加坡元', nameEn: 'Singapore Dollar', decimals: 2 },
  AUD: { symbol: 'A$', name: '澳元', nameEn: 'Australian Dollar', decimals: 2 },
  CAD: { symbol: 'C$', name: '加元', nameEn: 'Canadian Dollar', decimals: 2 },
  KRW: { symbol: '₩', name: '韩元', nameEn: 'South Korean Won', decimals: 0 },
};

/**
 * 备用汇率（当 API 不可用时使用）
 * 基于 CNY 的汇率，需要定期更新
 */
const FALLBACK_RATES_TO_CNY: Record<CurrencyType, number> = {
  CNY: 1,
  USD: 7.24,
  EUR: 7.85,
  GBP: 9.15,
  JPY: 0.048,
  HKD: 0.93,
  SGD: 5.38,
  AUD: 4.72,
  CAD: 5.32,
  KRW: 0.0053,
};

/**
 * 汇率服务类
 */
export class ExchangeRateService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.EXCHANGE_RATE_API_KEY || '';
    this.baseUrl = 'https://api.exchangerate-api.com/v4';
  }

  /**
   * 获取汇率
   */
  async getExchangeRate(
    fromCurrency: CurrencyType,
    toCurrency: CurrencyType,
    date?: Date
  ): Promise<ExchangeRate> {
    // 相同货币
    if (fromCurrency === toCurrency) {
      return {
        fromCurrency,
        toCurrency,
        rate: 1,
        source: 'identity',
        timestamp: new Date(),
      };
    }

    // 检查缓存
    const cacheKey = `${fromCurrency}_${toCurrency}`;
    const cached = rateCache.get(cacheKey);
    if (cached && cached.expiry > new Date()) {
      return cached.rate;
    }

    // 尝试从 API 获取
    try {
      const rate = await this.fetchRateFromAPI(fromCurrency, toCurrency);

      // 缓存结果
      rateCache.set(cacheKey, {
        rate,
        expiry: new Date(Date.now() + CACHE_DURATION_MS),
      });

      return rate;
    } catch (error) {
      console.warn('Failed to fetch exchange rate from API, using fallback', error);
      return this.getFallbackRate(fromCurrency, toCurrency);
    }
  }

  /**
   * 从 API 获取汇率
   */
  private async fetchRateFromAPI(
    fromCurrency: CurrencyType,
    toCurrency: CurrencyType
  ): Promise<ExchangeRate> {
    const response = await fetch(`${this.baseUrl}/latest/${fromCurrency}`);

    if (!response.ok) {
      throw new Error(`Exchange rate API error: ${response.status}`);
    }

    const data = await response.json();
    const rate = data.rates[toCurrency];

    if (!rate) {
      throw new Error(`Rate not found for ${fromCurrency} to ${toCurrency}`);
    }

    return {
      fromCurrency,
      toCurrency,
      rate,
      source: 'exchangerate-api.com',
      timestamp: new Date(),
    };
  }

  /**
   * 获取备用汇率
   */
  private getFallbackRate(
    fromCurrency: CurrencyType,
    toCurrency: CurrencyType
  ): ExchangeRate {
    // 先转换到 CNY，再转换到目标货币
    const fromToCNY = FALLBACK_RATES_TO_CNY[fromCurrency];
    const toToCNY = FALLBACK_RATES_TO_CNY[toCurrency];
    const rate = fromToCNY / toToCNY;

    return {
      fromCurrency,
      toCurrency,
      rate,
      source: 'fallback',
      timestamp: new Date(),
    };
  }

  /**
   * 转换货币
   */
  async convert(request: CurrencyConversionRequest): Promise<CurrencyConversionResponse> {
    const { amount, fromCurrency, toCurrency, date } = request;

    const exchangeRate = await this.getExchangeRate(fromCurrency, toCurrency, date);
    const convertedAmount = this.roundToDecimals(
      amount * exchangeRate.rate,
      CURRENCY_INFO[toCurrency].decimals
    );

    return {
      originalAmount: amount,
      originalCurrency: fromCurrency,
      convertedAmount,
      targetCurrency: toCurrency,
      exchangeRate: exchangeRate.rate,
      rateDate: exchangeRate.timestamp,
      source: exchangeRate.source,
    };
  }

  /**
   * 批量转换到指定货币
   */
  async convertMultiple(
    items: { amount: number; currency: CurrencyType }[],
    targetCurrency: CurrencyType
  ): Promise<
    {
      original: { amount: number; currency: CurrencyType };
      converted: { amount: number; currency: CurrencyType };
      exchangeRate: number;
    }[]
  > {
    const results = await Promise.all(
      items.map(async (item) => {
        const conversion = await this.convert({
          amount: item.amount,
          fromCurrency: item.currency,
          toCurrency: targetCurrency,
        });

        return {
          original: { amount: item.amount, currency: item.currency },
          converted: { amount: conversion.convertedAmount, currency: targetCurrency },
          exchangeRate: conversion.exchangeRate,
        };
      })
    );

    return results;
  }

  /**
   * 四舍五入到指定小数位
   */
  private roundToDecimals(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }
}

/**
 * 格式化货币显示
 */
export function formatCurrency(
  amount: number,
  currency: CurrencyType,
  options?: { showSymbol?: boolean; showCode?: boolean }
): string {
  const info = CURRENCY_INFO[currency];
  const { showSymbol = true, showCode = false } = options || {};

  const formatted = amount.toLocaleString('zh-CN', {
    minimumFractionDigits: info.decimals,
    maximumFractionDigits: info.decimals,
  });

  if (showSymbol && showCode) {
    return `${info.symbol}${formatted} ${currency}`;
  } else if (showSymbol) {
    return `${info.symbol}${formatted}`;
  } else if (showCode) {
    return `${formatted} ${currency}`;
  }

  return formatted;
}

/**
 * 解析货币字符串
 */
export function parseCurrencyString(
  value: string
): { amount: number; currency: CurrencyType } | null {
  // 尝试匹配常见格式
  const patterns = [
    // ¥1,234.56 或 $1,234.56
    /^([¥$€£₩])\s*([\d,]+\.?\d*)$/,
    // 1,234.56 CNY 或 1,234.56 USD
    /^([\d,]+\.?\d*)\s*([A-Z]{3})$/,
    // CNY 1,234.56
    /^([A-Z]{3})\s*([\d,]+\.?\d*)$/,
  ];

  for (const pattern of patterns) {
    const match = value.trim().match(pattern);
    if (match) {
      const [, part1, part2] = match;

      // 判断哪个是金额，哪个是货币
      let amount: number;
      let currencyStr: string;

      if (/^\d/.test(part1)) {
        amount = parseFloat(part1.replace(/,/g, ''));
        currencyStr = part2;
      } else {
        currencyStr = part1;
        amount = parseFloat(part2.replace(/,/g, ''));
      }

      // 符号到货币代码的映射
      const symbolToCurrency: Record<string, CurrencyType> = {
        '¥': Currency.CNY,
        $: Currency.USD,
        '€': Currency.EUR,
        '£': Currency.GBP,
        '₩': Currency.KRW,
      };

      const currency =
        symbolToCurrency[currencyStr] ||
        (Object.values(Currency).includes(currencyStr as CurrencyType)
          ? (currencyStr as CurrencyType)
          : null);

      if (currency && !isNaN(amount)) {
        return { amount, currency };
      }
    }
  }

  return null;
}

// 默认导出单例
export const exchangeRateService = new ExchangeRateService();
