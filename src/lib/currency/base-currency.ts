/**
 * 本位币配置
 *
 * 系统默认本位币和货币符号映射
 * 实际本位币从租户配置读取，这里提供默认值和常量
 */

import { CurrencyType, Currency } from '@/types';

/**
 * 系统默认本位币
 *
 * 当无法从租户配置获取时使用此默认值
 */
export const SYSTEM_BASE_CURRENCY: CurrencyType = Currency.USD;

/**
 * 货币符号映射
 */
export const CURRENCY_SYMBOLS: Record<CurrencyType, string> = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: 'JP¥',
  HKD: 'HK$',
  SGD: 'S$',
  AUD: 'A$',
  CAD: 'C$',
  KRW: '₩',
};

/**
 * 货币名称映射
 */
export const CURRENCY_NAMES: Record<CurrencyType, { zh: string; en: string }> = {
  CNY: { zh: '人民币', en: 'Chinese Yuan' },
  USD: { zh: '美元', en: 'US Dollar' },
  EUR: { zh: '欧元', en: 'Euro' },
  GBP: { zh: '英镑', en: 'British Pound' },
  JPY: { zh: '日元', en: 'Japanese Yen' },
  HKD: { zh: '港币', en: 'Hong Kong Dollar' },
  SGD: { zh: '新加坡元', en: 'Singapore Dollar' },
  AUD: { zh: '澳元', en: 'Australian Dollar' },
  CAD: { zh: '加元', en: 'Canadian Dollar' },
  KRW: { zh: '韩元', en: 'South Korean Won' },
};

/**
 * 支持的本位币列表（可作为记账本位币的货币）
 */
export const SUPPORTED_BASE_CURRENCIES: CurrencyType[] = [
  Currency.USD,
  Currency.CNY,
  Currency.EUR,
  Currency.GBP,
  Currency.JPY,
  Currency.HKD,
  Currency.SGD,
  Currency.AUD,
  Currency.CAD,
];

/**
 * 验证货币类型是否有效
 */
export function isValidCurrency(currency: string): currency is CurrencyType {
  return Object.values(Currency).includes(currency as CurrencyType);
}

/**
 * 验证是否为支持的本位币
 */
export function isSupportedBaseCurrency(currency: string): boolean {
  return SUPPORTED_BASE_CURRENCIES.includes(currency as CurrencyType);
}
