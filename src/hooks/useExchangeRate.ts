/**
 * 汇率 Hook
 * 统一前端汇率获取，确保与后端数据一致
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CurrencyType, Currency } from '@/types';

interface ExchangeRateInfo {
  rate: number;
  source: string;
}

interface ExchangeRates {
  [currency: string]: ExchangeRateInfo;
}

interface CurrencyInfo {
  symbol: string;
  name: string;
  nameEn: string;
  decimals: number;
}

interface UseExchangeRateReturn {
  /** 所有货币到基准货币的汇率 */
  rates: ExchangeRates;
  /** 货币信息（符号、名称等） */
  currencyInfo: Record<string, CurrencyInfo>;
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: Error | null;
  /** 获取从 from 到 to 的汇率 */
  getRate: (from: CurrencyType, to: CurrencyType) => number;
  /** 转换金额 */
  convert: (amount: number, from: CurrencyType, to: CurrencyType) => number;
  /** 格式化货币显示 */
  formatAmount: (amount: number, currency: CurrencyType) => string;
  /** 刷新汇率 */
  refresh: () => Promise<void>;
}

// 默认备用汇率（当 API 不可用时使用）
const FALLBACK_RATES: ExchangeRates = {
  CNY: { rate: 1, source: 'fallback' },
  USD: { rate: 7.24, source: 'fallback' },
  EUR: { rate: 7.85, source: 'fallback' },
  GBP: { rate: 9.15, source: 'fallback' },
  JPY: { rate: 0.048, source: 'fallback' },
  HKD: { rate: 0.93, source: 'fallback' },
  SGD: { rate: 5.38, source: 'fallback' },
  AUD: { rate: 4.72, source: 'fallback' },
  CAD: { rate: 5.32, source: 'fallback' },
  KRW: { rate: 0.0053, source: 'fallback' },
};

const FALLBACK_CURRENCY_INFO: Record<string, CurrencyInfo> = {
  CNY: { symbol: '¥', name: '人民币', nameEn: 'Chinese Yuan', decimals: 2 },
  USD: { symbol: '$', name: '美元', nameEn: 'US Dollar', decimals: 2 },
  EUR: { symbol: '€', name: '欧元', nameEn: 'Euro', decimals: 2 },
  GBP: { symbol: '£', name: '英镑', nameEn: 'British Pound', decimals: 2 },
  JPY: { symbol: 'JP¥', name: '日元', nameEn: 'Japanese Yen', decimals: 0 },
  HKD: { symbol: 'HK$', name: '港币', nameEn: 'Hong Kong Dollar', decimals: 2 },
  SGD: { symbol: 'S$', name: '新加坡元', nameEn: 'Singapore Dollar', decimals: 2 },
  AUD: { symbol: 'A$', name: '澳元', nameEn: 'Australian Dollar', decimals: 2 },
  CAD: { symbol: 'C$', name: '加元', nameEn: 'Canadian Dollar', decimals: 2 },
  KRW: { symbol: '₩', name: '韩元', nameEn: 'South Korean Won', decimals: 0 },
};

/**
 * 统一汇率 Hook
 * @param baseCurrency 基准货币，默认 CNY
 */
export function useExchangeRate(
  baseCurrency: CurrencyType = Currency.CNY
): UseExchangeRateReturn {
  const [rates, setRates] = useState<ExchangeRates>(FALLBACK_RATES);
  const [currencyInfo, setCurrencyInfo] = useState<Record<string, CurrencyInfo>>(
    FALLBACK_CURRENCY_INFO
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const fetchedRef = useRef(false);

  const fetchRates = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/exchange-rates?target=${baseCurrency}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch rates: ${response.status}`);
      }

      const data = await response.json();

      if (data.rates) {
        setRates(data.rates);
      }
      if (data.currencyInfo) {
        setCurrencyInfo(data.currencyInfo);
      }
    } catch (err) {
      console.error('Failed to fetch exchange rates:', err);
      setError(err as Error);
      // 保持使用备用汇率
    } finally {
      setLoading(false);
    }
  }, [baseCurrency]);

  useEffect(() => {
    // 避免重复请求
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetchRates();
  }, [fetchRates]);

  /**
   * 获取从 from 到 to 的汇率
   *
   * 注意：如果货币不在系统支持列表中，会返回 null 并打印警告
   */
  const getRate = useCallback(
    (from: CurrencyType, to: CurrencyType): number => {
      if (from === to) return 1;

      // rates 是相对于 baseCurrency 的
      // 例如 rates['USD'] = 7.24 表示 1 USD = 7.24 CNY（当 baseCurrency = CNY）
      const fromRateInfo = rates[from];
      const toRateInfo = rates[to];

      // 检查货币是否在支持列表中
      if (!fromRateInfo) {
        console.warn(`[汇率警告] 货币 ${from} 不在支持列表中，无法获取汇率`);
      }
      if (!toRateInfo) {
        console.warn(`[汇率警告] 货币 ${to} 不在支持列表中，无法获取汇率`);
      }

      // 如果任一货币缺失汇率，返回 NaN 以便上层检测
      if (!fromRateInfo || !toRateInfo) {
        return NaN;
      }

      // 计算 from -> to 的汇率
      // from -> baseCurrency -> to
      // 如果 baseCurrency = CNY:
      //   1 CAD = 5.32 CNY (fromRate)
      //   1 USD = 7.24 CNY (toRate)
      //   1 CAD = 5.32 / 7.24 USD = 0.735 USD
      return fromRateInfo.rate / toRateInfo.rate;
    },
    [rates]
  );

  /**
   * 转换金额
   */
  const convert = useCallback(
    (amount: number, from: CurrencyType, to: CurrencyType): number => {
      if (from === to) return amount;

      const rate = getRate(from, to);
      const decimals = currencyInfo[to]?.decimals ?? 2;
      const factor = Math.pow(10, decimals);
      return Math.round(amount * rate * factor) / factor;
    },
    [getRate, currencyInfo]
  );

  /**
   * 格式化货币显示
   */
  const formatAmount = useCallback(
    (amount: number, currency: CurrencyType): string => {
      const info = currencyInfo[currency] || FALLBACK_CURRENCY_INFO[currency];
      if (!info) return `${amount} ${currency}`;

      const formatted = amount.toLocaleString('zh-CN', {
        minimumFractionDigits: info.decimals,
        maximumFractionDigits: info.decimals,
      });

      // 对于有符号歧义的货币（CNY/JPY），显示货币代码
      if (currency === 'CNY' || currency === 'JPY') {
        return `${info.symbol}${formatted} ${currency}`;
      }

      return `${info.symbol}${formatted}`;
    },
    [currencyInfo]
  );

  return {
    rates,
    currencyInfo,
    loading,
    error,
    getRate,
    convert,
    formatAmount,
    refresh: fetchRates,
  };
}

export default useExchangeRate;
