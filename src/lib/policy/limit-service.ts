/**
 * 政策限额服务
 * 支持 per_day 和 per_month 类型的限额检查
 */

import { db } from '@/lib/db';
import { policies, reimbursements, reimbursementItems } from '@/lib/db/schema';
import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm';

// 政策规则类型
interface PolicyRule {
  id: string;
  name: string;
  description?: string;
  categories?: string[];  // 适用的费用类别，如 ['hotel', 'meal']
  limit?: {
    type: 'per_item' | 'per_day' | 'per_month' | 'per_year';
    amount: number;
    currency: string;
  };
  condition?: {
    type: string;
    operator: string;
    value: string[];
  };
  message?: string;
}

// 限额检查结果
export interface LimitCheckResult {
  isWithinLimit: boolean;
  limitType: 'per_day' | 'per_month' | 'per_item' | 'per_year';
  limitAmount: number;
  limitCurrency: string;
  currentAmount: number;       // 本次提交金额
  existingAmount: number;      // 已存在的累计金额
  totalAmount: number;         // 合计金额
  remainingAmount: number;     // 剩余可用额度
  adjustedAmount: number;      // 调整后的金额（不超过剩余额度）
  wasAdjusted: boolean;        // 是否被调整
  ruleName: string;
  message: string;
  categories: string[];
}

// 批量检查结果
export interface BatchLimitCheckResult {
  items: Array<{
    category: string;
    date: string;
    originalAmount: number;
    adjustedAmount: number;
    wasAdjusted: boolean;
    checkResult?: LimitCheckResult;
  }>;
  totalAdjusted: number;
  messages: string[];
}

/**
 * 获取租户的活跃政策规则
 */
export async function getTenantPolicyRules(tenantId: string): Promise<PolicyRule[]> {
  const tenantPolicies = await db.query.policies.findMany({
    where: and(
      eq(policies.tenantId, tenantId),
      eq(policies.isActive, true)
    ),
  });

  const rules: PolicyRule[] = [];

  for (const policy of tenantPolicies) {
    const policyRules = policy.rules as PolicyRule[] | null;
    if (policyRules) {
      rules.push(...policyRules);
    }
  }

  return rules;
}

/**
 * 查询用户某一天的已报销金额（按类别）
 */
export async function getDailyReimbursedAmount(
  userId: string,
  tenantId: string,
  date: Date,
  categories: string[]
): Promise<number> {
  // 获取当天的开始和结束时间
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // 查询该用户当天已提交的报销单（排除已拒绝的）
  const userReimbursements = await db
    .select({ id: reimbursements.id })
    .from(reimbursements)
    .where(and(
      eq(reimbursements.userId, userId),
      eq(reimbursements.tenantId, tenantId),
      sql`${reimbursements.status} NOT IN ('rejected', 'draft')`
    ));

  if (userReimbursements.length === 0) {
    return 0;
  }

  const reimbursementIds = userReimbursements.map(r => r.id);

  // 查询这些报销单中，指定日期和类别的费用项
  const items = await db
    .select({
      amount: reimbursementItems.amountInBaseCurrency,
    })
    .from(reimbursementItems)
    .where(and(
      inArray(reimbursementItems.reimbursementId, reimbursementIds),
      inArray(reimbursementItems.category, categories),
      gte(reimbursementItems.date, startOfDay),
      lte(reimbursementItems.date, endOfDay)
    ));

  return items.reduce((sum, item) => sum + (item.amount || 0), 0);
}

/**
 * 查询用户当月的已报销金额（按类别）
 */
export async function getMonthlyReimbursedAmount(
  userId: string,
  tenantId: string,
  date: Date,
  categories: string[]
): Promise<number> {
  // 获取当月的开始和结束时间
  const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

  // 查询该用户当月已提交的报销单（排除已拒绝的和草稿）
  const userReimbursements = await db
    .select({ id: reimbursements.id })
    .from(reimbursements)
    .where(and(
      eq(reimbursements.userId, userId),
      eq(reimbursements.tenantId, tenantId),
      sql`${reimbursements.status} NOT IN ('rejected', 'draft')`
    ));

  if (userReimbursements.length === 0) {
    return 0;
  }

  const reimbursementIds = userReimbursements.map(r => r.id);

  // 查询这些报销单中，当月指定类别的费用项
  const items = await db
    .select({
      amount: reimbursementItems.amountInBaseCurrency,
    })
    .from(reimbursementItems)
    .where(and(
      inArray(reimbursementItems.reimbursementId, reimbursementIds),
      inArray(reimbursementItems.category, categories),
      gte(reimbursementItems.date, startOfMonth),
      lte(reimbursementItems.date, endOfMonth)
    ));

  return items.reduce((sum, item) => sum + (item.amount || 0), 0);
}

/**
 * 检查单个费用项是否符合限额
 */
export async function checkItemLimit(
  userId: string,
  tenantId: string,
  item: {
    category: string;
    amount: number;          // 原币金额
    amountInBaseCurrency: number;  // USD金额
    date: Date;
    location?: string;
  },
  rules: PolicyRule[]
): Promise<LimitCheckResult | null> {
  // 找到适用于该类别的规则
  const applicableRule = rules.find(rule => {
    if (!rule.limit || !rule.categories) return false;
    return rule.categories.includes(item.category);
  });

  if (!applicableRule || !applicableRule.limit) {
    return null; // 没有适用的限额规则
  }

  const { limit, categories = [], name, message } = applicableRule;
  const itemAmount = item.amountInBaseCurrency;

  // 根据限额类型进行检查
  if (limit.type === 'per_day') {
    // 每日限额检查
    // 1. 先检查单笔是否超过每日限额
    if (itemAmount > limit.amount) {
      const adjustedAmount = limit.amount;
      return {
        isWithinLimit: false,
        limitType: 'per_day',
        limitAmount: limit.amount,
        limitCurrency: limit.currency,
        currentAmount: itemAmount,
        existingAmount: 0,
        totalAmount: itemAmount,
        remainingAmount: limit.amount,
        adjustedAmount,
        wasAdjusted: true,
        ruleName: name,
        message: `单笔金额 $${itemAmount.toFixed(2)} 超过每日限额 $${limit.amount}，已调整为 $${adjustedAmount.toFixed(2)}`,
        categories,
      };
    }

    // 2. 查询同一天已有的报销金额
    const existingAmount = await getDailyReimbursedAmount(userId, tenantId, item.date, categories);
    const totalAmount = existingAmount + itemAmount;
    const remainingAmount = Math.max(0, limit.amount - existingAmount);

    if (totalAmount > limit.amount) {
      const adjustedAmount = Math.max(0, remainingAmount);
      return {
        isWithinLimit: false,
        limitType: 'per_day',
        limitAmount: limit.amount,
        limitCurrency: limit.currency,
        currentAmount: itemAmount,
        existingAmount,
        totalAmount,
        remainingAmount,
        adjustedAmount,
        wasAdjusted: adjustedAmount !== itemAmount,
        ruleName: name,
        message: `当日已报销 $${existingAmount.toFixed(2)}，本次 $${itemAmount.toFixed(2)}，超过每日限额 $${limit.amount}，已调整为 $${adjustedAmount.toFixed(2)}`,
        categories,
      };
    }

    return {
      isWithinLimit: true,
      limitType: 'per_day',
      limitAmount: limit.amount,
      limitCurrency: limit.currency,
      currentAmount: itemAmount,
      existingAmount,
      totalAmount,
      remainingAmount,
      adjustedAmount: itemAmount,
      wasAdjusted: false,
      ruleName: name,
      message: message || '',
      categories,
    };
  }

  if (limit.type === 'per_month') {
    // 每月限额检查
    const existingAmount = await getMonthlyReimbursedAmount(userId, tenantId, item.date, categories);
    const totalAmount = existingAmount + itemAmount;
    const remainingAmount = Math.max(0, limit.amount - existingAmount);

    if (totalAmount > limit.amount) {
      const adjustedAmount = Math.max(0, remainingAmount);
      return {
        isWithinLimit: false,
        limitType: 'per_month',
        limitAmount: limit.amount,
        limitCurrency: limit.currency,
        currentAmount: itemAmount,
        existingAmount,
        totalAmount,
        remainingAmount,
        adjustedAmount,
        wasAdjusted: adjustedAmount !== itemAmount,
        ruleName: name,
        message: `当月已报销 $${existingAmount.toFixed(2)}，本次 $${itemAmount.toFixed(2)}，超过月度限额 $${limit.amount}，已调整为 $${adjustedAmount.toFixed(2)}`,
        categories,
      };
    }

    return {
      isWithinLimit: true,
      limitType: 'per_month',
      limitAmount: limit.amount,
      limitCurrency: limit.currency,
      currentAmount: itemAmount,
      existingAmount,
      totalAmount,
      remainingAmount,
      adjustedAmount: itemAmount,
      wasAdjusted: false,
      ruleName: name,
      message: message || '',
      categories,
    };
  }

  if (limit.type === 'per_item') {
    // 单笔限额检查
    if (itemAmount > limit.amount) {
      return {
        isWithinLimit: false,
        limitType: 'per_item',
        limitAmount: limit.amount,
        limitCurrency: limit.currency,
        currentAmount: itemAmount,
        existingAmount: 0,
        totalAmount: itemAmount,
        remainingAmount: limit.amount,
        adjustedAmount: limit.amount,
        wasAdjusted: true,
        ruleName: name,
        message: `金额 $${itemAmount.toFixed(2)} 超过单笔限额 $${limit.amount}，已调整为 $${limit.amount.toFixed(2)}`,
        categories,
      };
    }

    return {
      isWithinLimit: true,
      limitType: 'per_item',
      limitAmount: limit.amount,
      limitCurrency: limit.currency,
      currentAmount: itemAmount,
      existingAmount: 0,
      totalAmount: itemAmount,
      remainingAmount: limit.amount - itemAmount,
      adjustedAmount: itemAmount,
      wasAdjusted: false,
      ruleName: name,
      message: message || '',
      categories,
    };
  }

  return null;
}

/**
 * 批量检查报销项的限额
 * 处理同一请求中多个费用项的累计计算
 */
export async function checkItemsLimit(
  userId: string,
  tenantId: string,
  items: Array<{
    category: string;
    amount: number;
    amountInBaseCurrency: number;
    date: string;
    location?: string;
  }>
): Promise<BatchLimitCheckResult> {
  const rules = await getTenantPolicyRules(tenantId);

  // 用于追踪同一请求中已经累计的金额
  // key: `${limitType}_${categories.join(',')}_${dateKey}`
  const accumulatedAmounts: Record<string, number> = {};

  const results: BatchLimitCheckResult['items'] = [];
  const messages: string[] = [];
  let totalAdjusted = 0;

  for (const item of items) {
    const itemDate = new Date(item.date);

    // 找到适用于该类别的规则
    const applicableRule = rules.find(rule => {
      if (!rule.limit || !rule.categories) return false;
      return rule.categories.includes(item.category);
    });

    if (!applicableRule || !applicableRule.limit) {
      // 没有限额规则，保持原金额
      results.push({
        category: item.category,
        date: item.date,
        originalAmount: item.amountInBaseCurrency,
        adjustedAmount: item.amountInBaseCurrency,
        wasAdjusted: false,
      });
      continue;
    }

    const { limit, categories = [], name } = applicableRule;

    // 生成累计金额的key
    let accumulatorKey: string;
    let existingDbAmount: number = 0;

    if (limit.type === 'per_day') {
      const dateKey = itemDate.toISOString().split('T')[0];
      accumulatorKey = `per_day_${categories.sort().join(',')}_${dateKey}`;

      // 首次遇到这个key时，查询数据库中已有的金额
      if (accumulatedAmounts[accumulatorKey] === undefined) {
        existingDbAmount = await getDailyReimbursedAmount(userId, tenantId, itemDate, categories);
        accumulatedAmounts[accumulatorKey] = existingDbAmount;
      }
    } else if (limit.type === 'per_month') {
      const monthKey = `${itemDate.getFullYear()}-${itemDate.getMonth() + 1}`;
      accumulatorKey = `per_month_${categories.sort().join(',')}_${monthKey}`;

      // 首次遇到这个key时，查询数据库中已有的金额
      if (accumulatedAmounts[accumulatorKey] === undefined) {
        existingDbAmount = await getMonthlyReimbursedAmount(userId, tenantId, itemDate, categories);
        accumulatedAmounts[accumulatorKey] = existingDbAmount;
      }
    } else {
      // per_item 类型，直接检查
      accumulatorKey = `per_item_${item.category}`;
      accumulatedAmounts[accumulatorKey] = 0;
    }

    const currentAccumulated = accumulatedAmounts[accumulatorKey] || 0;
    const remainingAmount = Math.max(0, limit.amount - currentAccumulated);
    let adjustedAmount = item.amountInBaseCurrency;
    let wasAdjusted = false;

    if (limit.type === 'per_item') {
      // 单笔限额
      if (item.amountInBaseCurrency > limit.amount) {
        adjustedAmount = limit.amount;
        wasAdjusted = true;
        messages.push(`${name}: 金额 $${item.amountInBaseCurrency.toFixed(2)} 超过单笔限额 $${limit.amount}，已调整为 $${adjustedAmount.toFixed(2)}`);
      }
    } else {
      // per_day 或 per_month
      if (item.amountInBaseCurrency > remainingAmount) {
        adjustedAmount = Math.max(0, remainingAmount);
        wasAdjusted = true;

        if (adjustedAmount === 0) {
          messages.push(`${name}: 已达到${limit.type === 'per_day' ? '每日' : '每月'}限额 $${limit.amount}，本项金额调整为 $0`);
        } else {
          messages.push(`${name}: 剩余额度 $${remainingAmount.toFixed(2)}，金额从 $${item.amountInBaseCurrency.toFixed(2)} 调整为 $${adjustedAmount.toFixed(2)}`);
        }
      }

      // 更新累计金额
      accumulatedAmounts[accumulatorKey] = currentAccumulated + adjustedAmount;
    }

    if (wasAdjusted) {
      totalAdjusted++;
    }

    results.push({
      category: item.category,
      date: item.date,
      originalAmount: item.amountInBaseCurrency,
      adjustedAmount,
      wasAdjusted,
      checkResult: {
        isWithinLimit: !wasAdjusted,
        limitType: limit.type as 'per_day' | 'per_month' | 'per_item' | 'per_year',
        limitAmount: limit.amount,
        limitCurrency: limit.currency,
        currentAmount: item.amountInBaseCurrency,
        existingAmount: currentAccumulated,
        totalAmount: currentAccumulated + adjustedAmount,
        remainingAmount: Math.max(0, limit.amount - currentAccumulated - adjustedAmount),
        adjustedAmount,
        wasAdjusted,
        ruleName: name,
        message: wasAdjusted ? messages[messages.length - 1] : '',
        categories,
      },
    });
  }

  return {
    items: results,
    totalAdjusted,
    messages,
  };
}

/**
 * 获取用户当前的限额使用情况（用于前端显示）
 */
export async function getUserLimitStatus(
  userId: string,
  tenantId: string,
  date: Date = new Date()
): Promise<Array<{
  ruleName: string;
  limitType: string;
  limitAmount: number;
  limitCurrency: string;
  usedAmount: number;
  remainingAmount: number;
  percentage: number;
  categories: string[];
}>> {
  const rules = await getTenantPolicyRules(tenantId);
  const results = [];

  for (const rule of rules) {
    if (!rule.limit || !rule.categories) continue;

    const { limit, categories, name } = rule;
    let usedAmount = 0;

    if (limit.type === 'per_day') {
      usedAmount = await getDailyReimbursedAmount(userId, tenantId, date, categories);
    } else if (limit.type === 'per_month') {
      usedAmount = await getMonthlyReimbursedAmount(userId, tenantId, date, categories);
    }

    const remainingAmount = Math.max(0, limit.amount - usedAmount);
    const percentage = Math.min(100, (usedAmount / limit.amount) * 100);

    results.push({
      ruleName: name,
      limitType: limit.type,
      limitAmount: limit.amount,
      limitCurrency: limit.currency,
      usedAmount,
      remainingAmount,
      percentage,
      categories,
    });
  }

  return results;
}
