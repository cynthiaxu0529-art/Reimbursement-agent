/**
 * 货币汇率转换服务
 * 支持将发票币种转换为公司记账本位币
 *
 * 汇率策略：使用每月月初汇率固定，避免波动太大
 */

import type {
  CurrencyType,
  CurrencyConversionRequest,
  CurrencyConversionResponse,
  ExchangeRate,
} from '@/types';
import { Currency } from '@/types';

// 内存缓存汇率数据（作为快速缓存层）
const rateCache: Map<string, { rate: ExchangeRate; expiry: Date }> = new Map();
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 小时缓存

// 月初汇率内存缓存（整个月有效）
const monthlyRateCache: Map<string, { rate: number; source: string }> = new Map();

/**
 * 货币信息
 * 注意：displaySymbol 用于显示，避免 ¥ 符号歧义（CNY 和 JPY 都使用 ¥）
 */
export const CURRENCY_INFO: Record<
  CurrencyType,
  {
    symbol: string;        // 原始符号
    displaySymbol: string; // 用于显示的唯一符号（避免歧义）
    name: string;
    nameEn: string;
    decimals: number;
  }
> = {
  CNY: { symbol: '¥', displaySymbol: '¥', name: '人民币', nameEn: 'Chinese Yuan', decimals: 2 },
  USD: { symbol: '$', displaySymbol: '$', name: '美元', nameEn: 'US Dollar', decimals: 2 },
  EUR: { symbol: '€', displaySymbol: '€', name: '欧元', nameEn: 'Euro', decimals: 2 },
  GBP: { symbol: '£', displaySymbol: '£', name: '英镑', nameEn: 'British Pound', decimals: 2 },
  JPY: { symbol: '¥', displaySymbol: 'JP¥', name: '日元', nameEn: 'Japanese Yen', decimals: 0 },
  HKD: { symbol: 'HK$', displaySymbol: 'HK$', name: '港币', nameEn: 'Hong Kong Dollar', decimals: 2 },
  SGD: { symbol: 'S$', displaySymbol: 'S$', name: '新加坡元', nameEn: 'Singapore Dollar', decimals: 2 },
  AUD: { symbol: 'A$', displaySymbol: 'A$', name: '澳元', nameEn: 'Australian Dollar', decimals: 2 },
  CAD: { symbol: 'C$', displaySymbol: 'C$', name: '加元', nameEn: 'Canadian Dollar', decimals: 2 },
  KRW: { symbol: '₩', displaySymbol: '₩', name: '韩元', nameEn: 'South Korean Won', decimals: 0 },
};

/**
 * 默认备用汇率（当 API 不可用时使用）
 * 基于 CNY 的汇率
 * 注意：这些是硬编码的默认值，实际使用时会优先从 dynamicFallbackRates 获取
 */
const DEFAULT_FALLBACK_RATES_TO_CNY: Record<CurrencyType, number> = {
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
 * 动态备用汇率（可通过 API 更新）
 * 优先使用此缓存，如果为空则使用默认值
 */
const dynamicFallbackRates: Map<CurrencyType, { rate: number; updatedAt: Date }> = new Map();

/**
 * 获取备用汇率（优先动态，其次默认）
 */
function getFallbackRateToCNY(currency: CurrencyType): number {
  const dynamic = dynamicFallbackRates.get(currency);
  if (dynamic) {
    return dynamic.rate;
  }
  return DEFAULT_FALLBACK_RATES_TO_CNY[currency] || 1;
}

/**
 * 更新动态备用汇率
 */
export function updateFallbackRate(currency: CurrencyType, rate: number): void {
  dynamicFallbackRates.set(currency, { rate, updatedAt: new Date() });
}

/**
 * 批量更新动态备用汇率
 */
export function updateFallbackRates(rates: Record<CurrencyType, number>): void {
  const now = new Date();
  for (const [currency, rate] of Object.entries(rates)) {
    dynamicFallbackRates.set(currency as CurrencyType, { rate, updatedAt: now });
  }
}

/**
 * 获取所有备用汇率（用于调试或显示）
 */
export function getAllFallbackRates(): Record<CurrencyType, { rate: number; updatedAt: Date | null; source: 'dynamic' | 'default' }> {
  const result: Record<string, { rate: number; updatedAt: Date | null; source: 'dynamic' | 'default' }> = {};

  for (const currency of Object.values(Currency)) {
    const dynamic = dynamicFallbackRates.get(currency);
    if (dynamic) {
      result[currency] = { rate: dynamic.rate, updatedAt: dynamic.updatedAt, source: 'dynamic' };
    } else {
      result[currency] = { rate: DEFAULT_FALLBACK_RATES_TO_CNY[currency], updatedAt: null, source: 'default' };
    }
  }

  return result as Record<CurrencyType, { rate: number; updatedAt: Date | null; source: 'dynamic' | 'default' }>;
}

/**
 * 汇率服务类
 *
 * 汇率获取优先级：
 * 1. 月初固定汇率（数据库）- 优先使用，保证当月汇率一致性
 * 2. 内存缓存 - 快速访问
 * 3. 外部 API - 实时获取
 * 4. 备用汇率 - 兜底方案
 */
export class ExchangeRateService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.EXCHANGE_RATE_API_KEY || '';
    this.baseUrl = 'https://api.exchangerate-api.com/v4';
  }

  /**
   * 获取当前年月标识
   */
  private getCurrentYearMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * 根据日期获取年月标识
   */
  private getYearMonthFromDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * 获取汇率
   *
   * @param fromCurrency 源货币
   * @param toCurrency 目标货币
   * @param date 可选，指定日期（用于获取该月的月初汇率）
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

    const yearMonth = date ? this.getYearMonthFromDate(date) : this.getCurrentYearMonth();
    const monthlyKey = `${yearMonth}_${fromCurrency}_${toCurrency}`;

    // 1. 优先检查月初汇率缓存
    const monthlyRate = monthlyRateCache.get(monthlyKey);
    if (monthlyRate) {
      return {
        fromCurrency,
        toCurrency,
        rate: monthlyRate.rate,
        source: `monthly_${monthlyRate.source}`,
        timestamp: new Date(),
      };
    }

    // 2. 检查普通缓存
    const cacheKey = `${fromCurrency}_${toCurrency}`;
    const cached = rateCache.get(cacheKey);
    if (cached && cached.expiry > new Date()) {
      return cached.rate;
    }

    // 3. 尝试从 API 获取
    try {
      const rate = await this.fetchRateFromAPI(fromCurrency, toCurrency);

      // 缓存结果
      rateCache.set(cacheKey, {
        rate,
        expiry: new Date(Date.now() + CACHE_DURATION_MS),
      });

      // 如果是当月第一次获取，也缓存为月初汇率
      if (!monthlyRateCache.has(monthlyKey)) {
        monthlyRateCache.set(monthlyKey, {
          rate: rate.rate,
          source: rate.source,
        });
      }

      return rate;
    } catch (error) {
      console.warn('Failed to fetch exchange rate from API, using fallback', error);
      return this.getFallbackRate(fromCurrency, toCurrency);
    }
  }

  /**
   * 设置月初固定汇率（从数据库加载或手动设置）
   */
  setMonthlyRate(
    yearMonth: string,
    fromCurrency: CurrencyType,
    toCurrency: CurrencyType,
    rate: number,
    source: string = 'manual'
  ): void {
    const key = `${yearMonth}_${fromCurrency}_${toCurrency}`;
    monthlyRateCache.set(key, { rate, source });
  }

  /**
   * 获取当前月初汇率（如果已设置）
   */
  getMonthlyRate(
    fromCurrency: CurrencyType,
    toCurrency: CurrencyType,
    yearMonth?: string
  ): { rate: number; source: string } | null {
    const key = `${yearMonth || this.getCurrentYearMonth()}_${fromCurrency}_${toCurrency}`;
    return monthlyRateCache.get(key) || null;
  }

  /**
   * 清除月初汇率缓存（用于测试或强制刷新）
   */
  clearMonthlyRateCache(): void {
    monthlyRateCache.clear();
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
   * 获取备用汇率（优先使用动态更新的汇率）
   */
  private getFallbackRate(
    fromCurrency: CurrencyType,
    toCurrency: CurrencyType
  ): ExchangeRate {
    // 先转换到 CNY，再转换到目标货币
    // 使用 getFallbackRateToCNY 函数，优先获取动态更新的汇率
    const fromToCNY = getFallbackRateToCNY(fromCurrency);
    const toToCNY = getFallbackRateToCNY(toCurrency);
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
 * @param amount 金额
 * @param currency 货币类型
 * @param options 选项
 *   - showSymbol: 是否显示货币符号（默认 true）
 *   - showCode: 是否显示货币代码（默认 false）
 *   - useDisplaySymbol: 是否使用唯一显示符号，避免 ¥ 歧义（默认 true）
 */
export function formatCurrency(
  amount: number,
  currency: CurrencyType,
  options?: { showSymbol?: boolean; showCode?: boolean; useDisplaySymbol?: boolean }
): string {
  const info = CURRENCY_INFO[currency];
  const { showSymbol = true, showCode = false, useDisplaySymbol = true } = options || {};

  const formatted = amount.toLocaleString('zh-CN', {
    minimumFractionDigits: info.decimals,
    maximumFractionDigits: info.decimals,
  });

  // 使用唯一显示符号（避免 CNY/JPY 的 ¥ 符号歧义）
  const symbol = useDisplaySymbol ? info.displaySymbol : info.symbol;

  // 对于有符号歧义的货币（CNY/JPY），建议始终显示货币代码
  const needsCode = currency === 'CNY' || currency === 'JPY';
  const shouldShowCode = showCode || needsCode;

  if (showSymbol && shouldShowCode) {
    return `${symbol}${formatted} ${currency}`;
  } else if (showSymbol) {
    return `${symbol}${formatted}`;
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
