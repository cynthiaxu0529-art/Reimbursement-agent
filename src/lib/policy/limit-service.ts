/**
 * 政策限额服务
 * 用于获取和应用报销政策限额
 */

import { db } from '@/lib/db';
import { policies } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { ExpenseCategoryType, CurrencyType, RuleLimit, PolicyRule } from '@/types';

export interface CategoryLimit {
  category: ExpenseCategoryType;
  limit: RuleLimit;
  ruleName: string;
  message?: string;
}

export interface AppliedLimitResult {
  originalAmount: number;
  adjustedAmount: number;
  wasAdjusted: boolean;
  limit?: CategoryLimit;
  message?: string;
}

/**
 * 获取租户的所有政策限额
 */
export async function getTenantPolicyLimits(tenantId: string): Promise<CategoryLimit[]> {
  const tenantPolicies = await db.query.policies.findMany({
    where: and(
      eq(policies.tenantId, tenantId),
      eq(policies.isActive, true)
    ),
  });

  const limits: CategoryLimit[] = [];

  for (const policy of tenantPolicies) {
    const rules = policy.rules as PolicyRule[] | null;
    if (!rules) continue;

    for (const rule of rules) {
      // 只收集有 per_item 限额的规则（单笔上限）
      if (rule.limit && rule.limit.type === 'per_item' && rule.category) {
        limits.push({
          category: rule.category,
          limit: rule.limit,
          ruleName: rule.name,
          message: rule.message,
        });
      }
    }
  }

  return limits;
}

/**
 * 获取特定类别的政策限额
 */
export async function getCategoryLimit(
  tenantId: string,
  category: ExpenseCategoryType
): Promise<CategoryLimit | null> {
  const limits = await getTenantPolicyLimits(tenantId);
  return limits.find(l => l.category === category) || null;
}

/**
 * 应用限额约束到金额
 * 如果金额超过限额，返回限额值
 */
export function applyLimitToAmount(
  amount: number,
  currency: CurrencyType,
  limit: CategoryLimit | null
): AppliedLimitResult {
  if (!limit) {
    return {
      originalAmount: amount,
      adjustedAmount: amount,
      wasAdjusted: false,
    };
  }

  const limitAmount = limit.limit.amount;
  const limitCurrency = limit.limit.currency;

  // 如果货币相同，直接比较
  if (currency === limitCurrency) {
    if (amount > limitAmount) {
      return {
        originalAmount: amount,
        adjustedAmount: limitAmount,
        wasAdjusted: true,
        limit,
        message: `金额 ${amount} ${currency} 超过政策限额 ${limitAmount} ${limitCurrency}，已调整为限额值`,
      };
    }
  } else {
    // 如果货币不同，需要转换（简单处理：假设限额是CNY）
    // 实际应该使用汇率服务
    // 这里暂时跳过货币不同的情况，让后端继续使用原金额
    // 后续可以增强此逻辑
  }

  return {
    originalAmount: amount,
    adjustedAmount: amount,
    wasAdjusted: false,
    limit,
  };
}

/**
 * 批量应用限额到多个报销项
 */
export async function applyLimitsToItems(
  tenantId: string,
  items: Array<{
    category: ExpenseCategoryType;
    amount: number;
    currency: CurrencyType;
    amountInBaseCurrency?: number;
  }>
): Promise<{
  items: Array<{
    category: ExpenseCategoryType;
    originalAmount: number;
    adjustedAmount: number;
    originalAmountInBaseCurrency?: number;
    adjustedAmountInBaseCurrency?: number;
    wasAdjusted: boolean;
    message?: string;
  }>;
  totalAdjusted: number;
  adjustedItems: string[];
}> {
  const limits = await getTenantPolicyLimits(tenantId);
  const limitsMap = new Map<string, CategoryLimit>();

  for (const limit of limits) {
    limitsMap.set(limit.category, limit);
  }

  let totalAdjusted = 0;
  const adjustedItems: string[] = [];

  const processedItems = items.map(item => {
    const limit = limitsMap.get(item.category) || null;
    const result = applyLimitToAmount(item.amount, item.currency, limit);

    // 同时调整 baseCurrency 金额
    let adjustedAmountInBaseCurrency = item.amountInBaseCurrency;
    if (result.wasAdjusted && item.amountInBaseCurrency && item.amount > 0) {
      // 按比例调整 base currency 金额
      const ratio = result.adjustedAmount / result.originalAmount;
      adjustedAmountInBaseCurrency = item.amountInBaseCurrency * ratio;
    }

    if (result.wasAdjusted) {
      totalAdjusted++;
      adjustedItems.push(`${item.category}: ${result.originalAmount} → ${result.adjustedAmount}`);
    }

    return {
      category: item.category,
      originalAmount: result.originalAmount,
      adjustedAmount: result.adjustedAmount,
      originalAmountInBaseCurrency: item.amountInBaseCurrency,
      adjustedAmountInBaseCurrency,
      wasAdjusted: result.wasAdjusted,
      message: result.message,
    };
  });

  return {
    items: processedItems,
    totalAdjusted,
    adjustedItems,
  };
}

/**
 * 获取类别的限额信息（用于前端显示）
 */
export async function getCategoryLimitInfo(
  tenantId: string,
  category: ExpenseCategoryType
): Promise<{
  hasLimit: boolean;
  limitAmount?: number;
  limitCurrency?: CurrencyType;
  limitType?: string;
  ruleName?: string;
  message?: string;
} | null> {
  const limit = await getCategoryLimit(tenantId, category);

  if (!limit) {
    return { hasLimit: false };
  }

  return {
    hasLimit: true,
    limitAmount: limit.limit.amount,
    limitCurrency: limit.limit.currency,
    limitType: limit.limit.type,
    ruleName: limit.ruleName,
    message: limit.message,
  };
}
