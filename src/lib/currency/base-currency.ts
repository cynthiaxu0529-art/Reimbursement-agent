/**
 * 本位币配置
 *
 * 系统本位币（记账本位币）统一在此配置，避免硬编码分散在各处导致错误
 */

import { CurrencyType, Currency } from '@/types';

/**
 * 系统默认本位币
 *
 * 重要：修改此值会影响所有汇率转换的目标货币
 * - 所有原币金额都会转换到此货币
 * - 界面显示的"折算金额"以此货币为准
 */
export const SYSTEM_BASE_CURRENCY: CurrencyType = Currency.USD;

/**
 * 本位币信息
 */
export const BASE_CURRENCY_INFO = {
  code: SYSTEM_BASE_CURRENCY,
  symbol: '$',
  name: '美元',
  nameEn: 'US Dollar',
} as const;

/**
 * 验证货币类型是否有效
 */
export function isValidCurrency(currency: string): currency is CurrencyType {
  return Object.values(Currency).includes(currency as CurrencyType);
}

/**
 * 获取系统本位币
 *
 * 未来可扩展为从租户配置读取
 */
export function getBaseCurrency(_tenantId?: string): CurrencyType {
  // TODO: 未来可以从数据库读取租户配置的本位币
  // const tenant = await getTenant(tenantId);
  // return tenant?.baseCurrency || SYSTEM_BASE_CURRENCY;
  return SYSTEM_BASE_CURRENCY;
}
