/**
 * 本位币转换 Hook
 *
 * 封装汇率转换逻辑，统一转换到租户配置的记账本位币
 * 避免在各处手动指定目标货币导致的错误
 */

'use client';

import { useCallback, useMemo } from 'react';
import { CurrencyType } from '@/types';
import { useExchangeRate } from './useExchangeRate';
import { useTenantConfig } from './useTenantConfig';
import { CURRENCY_SYMBOLS, SYSTEM_BASE_CURRENCY } from '@/lib/currency/base-currency';

interface ConversionResult {
  /** 转换后的本位币金额 */
  amount: number;
  /** 使用的汇率（原币 → 本位币） */
  rate: number;
  /** 本位币代码 */
  baseCurrency: CurrencyType;
  /** 本位币符号 */
  symbol: string;
}

interface UseBaseCurrencyConversionReturn {
  /** 租户配置的记账本位币 */
  baseCurrency: CurrencyType;
  /** 本位币符号 */
  baseCurrencySymbol: string;
  /** 是否正在加载（汇率或配置） */
  loading: boolean;
  /** 错误信息 */
  error: Error | null;

  /**
   * 转换到本位币
   * @param amount 原币金额
   * @param fromCurrency 原币类型
   * @returns 转换结果，包含金额、汇率等
   *
   * @example
   * const { amount, rate } = convertToBase(286.29, 'CAD');
   * // 如果本位币是 USD: amount ≈ 210.42, rate ≈ 0.735
   */
  convertToBase: (amount: number, fromCurrency: CurrencyType) => ConversionResult;

  /**
   * 获取到本位币的汇率
   * @param fromCurrency 原币类型
   * @returns 汇率（原币 → 本位币）
   *
   * @example
   * const rate = getRateToBase('CAD');
   * // 如果本位币是 USD: rate ≈ 0.735 (1 CAD = 0.735 USD)
   */
  getRateToBase: (fromCurrency: CurrencyType) => number;

  /**
   * 格式化本位币金额显示
   * @param amount 本位币金额
   * @returns 格式化后的字符串
   *
   * @example
   * formatBaseAmount(210.42);
   * // 如果本位币是 USD: "$210.42"
   */
  formatBaseAmount: (amount: number) => string;
}

/**
 * 本位币转换 Hook
 *
 * 使用此 Hook 可以确保所有转换都正确地转到租户配置的本位币，避免方向错误
 * 本位币从租户配置（/api/settings/company）读取
 */
export function useBaseCurrencyConversion(): UseBaseCurrencyConversionReturn {
  // 从租户配置获取本位币
  const {
    baseCurrency: tenantBaseCurrency,
    loading: configLoading,
    error: configError,
  } = useTenantConfig();

  // 使用租户配置的本位币，如果未获取到则使用系统默认值
  const baseCurrency = tenantBaseCurrency || SYSTEM_BASE_CURRENCY;
  const baseCurrencySymbol = CURRENCY_SYMBOLS[baseCurrency] || '$';

  // 使用统一汇率 Hook
  const {
    getRate,
    convert,
    loading: ratesLoading,
    error: ratesError,
    currencyInfo,
  } = useExchangeRate();

  // 合并加载状态和错误
  const loading = configLoading || ratesLoading;
  const error = configError || ratesError;

  /**
   * 转换到本位币
   */
  const convertToBase = useCallback(
    (amount: number, fromCurrency: CurrencyType): ConversionResult => {
      if (fromCurrency === baseCurrency) {
        return {
          amount,
          rate: 1,
          baseCurrency,
          symbol: baseCurrencySymbol,
        };
      }

      const rate = getRate(fromCurrency, baseCurrency);
      const convertedAmount = convert(amount, fromCurrency, baseCurrency);

      return {
        amount: convertedAmount,
        rate,
        baseCurrency,
        symbol: baseCurrencySymbol,
      };
    },
    [getRate, convert, baseCurrency, baseCurrencySymbol]
  );

  /**
   * 获取到本位币的汇率
   */
  const getRateToBase = useCallback(
    (fromCurrency: CurrencyType): number => {
      return getRate(fromCurrency, baseCurrency);
    },
    [getRate, baseCurrency]
  );

  /**
   * 格式化本位币金额显示
   */
  const formatBaseAmount = useCallback(
    (amount: number): string => {
      const info = currencyInfo[baseCurrency];
      const decimals = info?.decimals ?? 2;

      const formatted = amount.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

      return `${baseCurrencySymbol}${formatted}`;
    },
    [currencyInfo, baseCurrency, baseCurrencySymbol]
  );

  return {
    baseCurrency,
    baseCurrencySymbol,
    loading,
    error,
    convertToBase,
    getRateToBase,
    formatBaseAmount,
  };
}

export default useBaseCurrencyConversion;
