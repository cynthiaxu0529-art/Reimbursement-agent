/**
 * 报销类别 → GL 科目映射
 *
 * 根据报销的 category 或 description 关键词，映射到 Accounting Agent 的 GL 科目。
 * 映射规则优先使用 synced_accounts 中的科目名称，如果不存在则使用 fallback 名称。
 */

import { getAccountName } from './chart-of-accounts-sync';

// ============================================================================
// 映射规则
// ============================================================================

interface MappingRule {
  accountCode: string;
  fallbackAccountName: string;
  categories: string[];
  keywords: string[];
}

/**
 * 映射规则表：category 精确匹配 + description 关键词匹配
 */
const MAPPING_RULES: MappingRule[] = [
  {
    accountCode: '6270',
    fallbackAccountName: 'G&A - Travel & Entertainment',
    categories: ['taxi', 'car_rental', 'fuel', 'parking', 'toll', 'flight', 'train', 'hotel'],
    keywords: [
      '交通', '打车', '出差', 'taxi', 'uber', 'rideshare',
      '机票', 'flight', 'airfare',
      '住宿', '酒店', 'hotel', 'lodging',
      '差旅', 'travel',
    ],
  },
  {
    accountCode: '6280',
    fallbackAccountName: 'G&A - Meals & Entertainment',
    categories: ['meal', 'client_entertainment'],
    keywords: ['餐饮', '餐费', '招待', 'meals', 'food', '午餐', '晚餐', '早餐', 'dinner', 'lunch', 'breakfast'],
  },
  {
    accountCode: '6230',
    fallbackAccountName: 'G&A - Office Supplies',
    categories: ['office_supplies', 'equipment', 'printing'],
    keywords: ['办公用品', '文具', 'office supplies', '办公', 'stationery'],
  },
  {
    accountCode: '6330',
    fallbackAccountName: 'G&A - Training & Development',
    categories: ['training', 'conference'],
    keywords: ['培训', '课程', 'training', 'conference', '会议', '学习', '研讨'],
  },
  {
    accountCode: '6370',
    fallbackAccountName: 'G&A - Shipping & Postage',
    categories: ['courier'],
    keywords: ['快递', '邮寄', 'shipping', 'postage', '物流', '邮费'],
  },
  {
    accountCode: '6290',
    fallbackAccountName: 'G&A - Telephone & Internet',
    categories: ['phone', 'internet'],
    keywords: ['通讯', '电话', 'internet', 'phone', '网络', '宽带', 'telecom'],
  },
  {
    accountCode: '6240',
    fallbackAccountName: 'G&A - Insurance',
    categories: [],
    keywords: ['保险', 'insurance'],
  },
];

const DEFAULT_ACCOUNT_CODE = '6390';
const DEFAULT_ACCOUNT_NAME = 'G&A - Miscellaneous Expense';

// ============================================================================
// 映射函数
// ============================================================================

/**
 * 根据报销类别和描述映射到 GL 科目
 *
 * @param category 报销的 category 字段
 * @param description 报销的 description 字段
 * @returns { accountCode, accountName }
 */
export async function mapExpenseToAccount(
  category: string,
  description: string
): Promise<{ accountCode: string; accountName: string }> {
  const categoryLower = (category || '').toLowerCase();
  const descLower = (description || '').toLowerCase();

  // 1. 先按 category 精确匹配
  for (const rule of MAPPING_RULES) {
    if (rule.categories.includes(categoryLower)) {
      const accountName = await resolveAccountName(rule.accountCode, rule.fallbackAccountName);
      return { accountCode: rule.accountCode, accountName };
    }
  }

  // 2. 再按 description 关键词匹配
  for (const rule of MAPPING_RULES) {
    for (const keyword of rule.keywords) {
      if (descLower.includes(keyword.toLowerCase())) {
        const accountName = await resolveAccountName(rule.accountCode, rule.fallbackAccountName);
        return { accountCode: rule.accountCode, accountName };
      }
    }
  }

  // 3. 兜底：无法分类
  const accountName = await resolveAccountName(DEFAULT_ACCOUNT_CODE, DEFAULT_ACCOUNT_NAME);
  return { accountCode: DEFAULT_ACCOUNT_CODE, accountName };
}

/**
 * 优先从 synced_accounts 获取科目名称，回退到 fallback
 */
async function resolveAccountName(accountCode: string, fallbackName: string): Promise<string> {
  try {
    const synced = await getAccountName(accountCode);
    return synced || fallbackName;
  } catch {
    return fallbackName;
  }
}

/**
 * 批量映射报销明细
 */
export async function mapExpenseItems(
  items: { category: string; description: string }[]
): Promise<{ accountCode: string; accountName: string }[]> {
  return Promise.all(
    items.map(item => mapExpenseToAccount(item.category, item.description))
  );
}
