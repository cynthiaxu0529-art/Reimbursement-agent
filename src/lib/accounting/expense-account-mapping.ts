/**
 * 报销类别 → GL 科目映射
 *
 * 根据报销的 category、description 关键词以及部门的费用性质(costCenter)，映射到 GL 科目。
 *
 * 核心逻辑：
 *   1. 优先使用部门表中的 costCenter 字段（rd / sm / ga）
 *   2. 若无 costCenter，根据部门名称关键词推断
 *   3. 根据 category + description 匹配具体费用类型
 *   4. 两者交叉得出最终科目代码
 */

import { getAccountName } from './chart-of-accounts-sync';

// ============================================================================
// 部门 → 费用性质
// ============================================================================

export type ExpenseFunction = 'rd' | 'sm' | 'ga';

/**
 * 部门名称关键词 → 费用性质（仅在部门未设置 costCenter 时作为降级匹配）
 */
const DEPT_RD_KEYWORDS = [
  '研发', '技术', '工程', '开发', '算法', '架构', '测试', 'qa', '产品',
  'r&d', 'rd', 'research', 'development', 'engineering', 'eng', 'tech',
  'platform', 'infrastructure', 'data', 'ai', 'ml', 'devops', 'sre',
];

const DEPT_SM_KEYWORDS = [
  '销售', '市场', '营销', '商务', '品牌', '增长', '获客', '客户成功',
  'sales', 'marketing', 'growth', 'bd', 'business development',
  'go-to-market', 'gtm', 'customer success', 'cs', 'revenue',
];

/**
 * 根据 costCenter 或部门名称判断费用性质
 *
 * @param costCenter  部门表中的 cost_center 字段（优先级最高）
 * @param departmentName 部门名称（降级匹配）
 */
export function classifyDepartment(
  costCenter?: string | null,
  departmentName?: string | null,
): ExpenseFunction {
  // 1. 优先使用显式设置的 costCenter
  if (costCenter === 'rd' || costCenter === 'sm' || costCenter === 'ga') {
    return costCenter;
  }
  // 2. 降级：根据部门名称关键词推断
  if (!departmentName) return 'ga';
  const lower = departmentName.toLowerCase();
  for (const kw of DEPT_RD_KEYWORDS) {
    if (lower.includes(kw)) return 'rd';
  }
  for (const kw of DEPT_SM_KEYWORDS) {
    if (lower.includes(kw)) return 'sm';
  }
  return 'ga';
}

// ============================================================================
// 费用类型 → 科目代码（按费用性质分列）
// ============================================================================

interface AccountCodeSet {
  rd: string;
  sm: string;
  ga: string;
  rdName: string;
  smName: string;
  gaName: string;
}

type ExpenseType =
  | 'travel'
  | 'meals'
  | 'office_supplies'
  | 'training'
  | 'shipping'
  | 'telecom'
  | 'insurance'
  | 'cloud'
  | 'software'
  | 'advertising'
  | 'miscellaneous';

const EXPENSE_TYPE_ACCOUNTS: Record<ExpenseType, AccountCodeSet> = {
  travel: {
    rd: '6440', sm: '6130', ga: '6270',
    rdName: 'R&D - Travel & Entertainment',
    smName: 'S&M - Travel & Entertainment',
    gaName: 'G&A - Travel & Entertainment',
  },
  meals: {
    rd: '6450', sm: '6140', ga: '6280',
    rdName: 'R&D - Meals & Entertainment',
    smName: 'S&M - Meals & Client Entertainment',
    gaName: 'G&A - Meals & Entertainment',
  },
  office_supplies: {
    rd: '6460', sm: '6150', ga: '6230',
    rdName: 'R&D - Office Supplies',
    smName: 'S&M - Office Supplies',
    gaName: 'G&A - Office Supplies',
  },
  training: {
    rd: '6470', sm: '6160', ga: '6330',
    rdName: 'R&D - Training & Conferences',
    smName: 'S&M - Training & Conferences',
    gaName: 'G&A - Training & Development',
  },
  shipping: {
    rd: '6490', sm: '6190', ga: '6370',
    rdName: 'R&D - Miscellaneous Expense',
    smName: 'S&M - Miscellaneous Expense',
    gaName: 'G&A - Shipping & Postage',
  },
  telecom: {
    rd: '6490', sm: '6190', ga: '6290',
    rdName: 'R&D - Miscellaneous Expense',
    smName: 'S&M - Miscellaneous Expense',
    gaName: 'G&A - Telephone & Internet',
  },
  insurance: {
    rd: '6490', sm: '6190', ga: '6240',
    rdName: 'R&D - Miscellaneous Expense',
    smName: 'S&M - Miscellaneous Expense',
    gaName: 'G&A - Insurance',
  },
  cloud: {
    rd: '6420', sm: '6190', ga: '6390',
    rdName: 'R&D - Cloud & Infrastructure',
    smName: 'S&M - Miscellaneous Expense',
    gaName: 'G&A - Miscellaneous Expense',
  },
  software: {
    rd: '6430', sm: '6190', ga: '6390',
    rdName: 'R&D - Software & Subscriptions',
    smName: 'S&M - Miscellaneous Expense',
    gaName: 'G&A - Miscellaneous Expense',
  },
  advertising: {
    rd: '6490', sm: '6120', ga: '6390',
    rdName: 'R&D - Miscellaneous Expense',
    smName: 'S&M - Advertising & Promotion',
    gaName: 'G&A - Miscellaneous Expense',
  },
  miscellaneous: {
    rd: '6490', sm: '6190', ga: '6390',
    rdName: 'R&D - Miscellaneous Expense',
    smName: 'S&M - Miscellaneous Expense',
    gaName: 'G&A - Miscellaneous Expense',
  },
};

// ============================================================================
// Category / keyword → 费用类型
// ============================================================================

interface ExpenseTypeRule {
  expenseType: ExpenseType;
  categories: string[];
  keywords: string[];
}

const EXPENSE_TYPE_RULES: ExpenseTypeRule[] = [
  {
    expenseType: 'travel',
    categories: ['taxi', 'car_rental', 'fuel', 'parking', 'toll', 'flight', 'train', 'hotel'],
    keywords: ['交通', '打车', '出差', 'taxi', 'uber', 'rideshare', '机票', 'flight', 'airfare', '住宿', '酒店', 'hotel', 'lodging', '差旅', 'travel'],
  },
  {
    expenseType: 'meals',
    categories: ['meal', 'client_entertainment'],
    keywords: ['餐饮', '餐费', '招待', 'meals', 'food', '午餐', '晚餐', '早餐', 'dinner', 'lunch', 'breakfast'],
  },
  {
    expenseType: 'office_supplies',
    categories: ['office_supplies', 'equipment', 'printing'],
    keywords: ['办公用品', '文具', 'office supplies', '办公', 'stationery'],
  },
  {
    expenseType: 'training',
    categories: ['training', 'conference'],
    keywords: ['培训', '课程', 'training', 'conference', '会议', '学习', '研讨'],
  },
  {
    expenseType: 'shipping',
    categories: ['courier'],
    keywords: ['快递', '邮寄', 'shipping', 'postage', '物流', '邮费'],
  },
  {
    expenseType: 'telecom',
    categories: ['phone', 'internet'],
    keywords: ['通讯', '电话', 'internet', 'phone', '网络', '宽带', 'telecom'],
  },
  {
    expenseType: 'insurance',
    categories: [],
    keywords: ['保险', 'insurance'],
  },
  {
    expenseType: 'cloud',
    categories: ['cloud_resource', 'ai_token'],
    keywords: ['云', 'cloud', 'aws', 'gcp', 'azure', 'server', '服务器', 'ai token', 'openai', 'anthropic'],
  },
  {
    expenseType: 'software',
    categories: ['software'],
    keywords: ['软件', 'software', 'license', '许可', 'saas', 'subscription', '订阅'],
  },
  {
    expenseType: 'advertising',
    categories: [],
    keywords: ['广告', 'advertising', 'promotion', '推广', '营销', 'marketing'],
  },
];

// ============================================================================
// 主映射函数
// ============================================================================

/**
 * 根据报销类别、描述和部门费用性质映射到 GL 科目
 *
 * @param category       报销的 category 字段
 * @param description    报销的 description 字段
 * @param costCenter     部门显式设定的费用性质（rd/sm/ga，优先使用）
 * @param departmentName 部门名称（当 costCenter 未设时降级推断）
 * @returns { accountCode, accountName }
 */
export async function mapExpenseToAccount(
  category: string,
  description: string,
  costCenter?: string | null,
  departmentName?: string | null,
): Promise<{ accountCode: string; accountName: string }> {
  const fn = classifyDepartment(costCenter, departmentName);
  const expenseType = matchExpenseType(category, description);
  const codes = EXPENSE_TYPE_ACCOUNTS[expenseType];
  const accountCode = codes[fn];
  const fallbackName = codes[`${fn}Name` as keyof AccountCodeSet] as string;
  const accountName = await resolveAccountName(accountCode, fallbackName);
  return { accountCode, accountName };
}

/**
 * 根据 category + description 匹配费用类型
 */
function matchExpenseType(category: string, description: string): ExpenseType {
  const categoryLower = (category || '').toLowerCase();
  const descLower = (description || '').toLowerCase();

  for (const rule of EXPENSE_TYPE_RULES) {
    if (rule.categories.includes(categoryLower)) {
      return rule.expenseType;
    }
  }

  for (const rule of EXPENSE_TYPE_RULES) {
    for (const keyword of rule.keywords) {
      if (descLower.includes(keyword.toLowerCase())) {
        return rule.expenseType;
      }
    }
  }

  return 'miscellaneous';
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
  items: { category: string; description: string; costCenter?: string | null; departmentName?: string | null }[]
): Promise<{ accountCode: string; accountName: string }[]> {
  return Promise.all(
    items.map(item => mapExpenseToAccount(item.category, item.description, item.costCenter, item.departmentName))
  );
}
