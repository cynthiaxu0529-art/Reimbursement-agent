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

import { getAccountName, isKnownAccountCode } from './chart-of-accounts-sync';

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
  'cto',
];

const DEPT_SM_KEYWORDS = [
  '销售', '市场', '营销', '商务', '品牌', '增长', '获客', '客户成功',
  'sales', 'marketing', 'growth', 'bd', 'business development',
  'go-to-market', 'gtm', 'customer success', 'cs', 'revenue',
  'cmo', 'cso',
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
  // Tech / cloud — split per Mapping conventions
  | 'ai_api'              // OpenAI / Anthropic / OpenRouter / Firecrawl → 6435
  | 'gpu_compute'         // Runpod / Lambda Labs / Vast.ai → 6420
  | 'web3_rpc'            // Alchemy / Infura / QuickNode / ZAN → 6425
  | 'web3_subscription'   // Privy / Dynamic / wallet-connect → 6430
  | 'company_saas'        // Notion / Slack / Zoom / 1Password / Google Workspace → 6350 regardless of function
  | 'cloud'               // generic AWS/GCP/Azure/Vercel → 6420 (R&D) / 6150 (S&M) / 6390 (G&A)
  | 'software'            // team-specific tool (defaults to R&D 6430 unless function overrides)
  // S&M
  | 'kol_marketing'       // KOL / KOC / influencer → 6125
  | 'community_rewards'   // 红包 / airdrop / referral rewards → 6145
  | 'advertising'         // Google / Meta / LinkedIn paid ads → 6120
  | 'content_seo'
  | 'pr_communications'
  | 'miscellaneous';

const EXPENSE_TYPE_ACCOUNTS: Record<ExpenseType, AccountCodeSet> = {
  travel: {
    rd: '6440', sm: '6170', ga: '6270',
    rdName: 'R&D - Travel & Entertainment',
    smName: 'S&M - Travel & Entertainment',
    gaName: 'G&A - Travel & Entertainment',
  },
  meals: {
    rd: '6450', sm: '6180', ga: '6280',
    rdName: 'R&D - Meals & Entertainment',
    smName: 'S&M - Meals & Entertainment',
    gaName: 'G&A - Meals & Entertainment',
  },
  office_supplies: {
    rd: '6410', sm: '6190', ga: '6230',
    rdName: 'R&D - Office Supplies',
    smName: 'S&M - Miscellaneous Expense',
    gaName: 'G&A - Office Supplies',
  },
  training: {
    rd: '6470', sm: '6140', ga: '6330',
    rdName: 'R&D - Training & Conferences',
    smName: 'S&M - Events & Conferences',
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
  // "AI model APIs → 6435" — distinct from raw compute (6420) and software subs (6430)
  ai_api: {
    rd: '6435', sm: '6150', ga: '6350',
    rdName: 'R&D - AI & API Services',
    smName: 'S&M - CRM & Sales Tools',
    gaName: 'G&A - Dues & Subscriptions',
  },
  // "Pay-per-second GPU rental goes to 6420 R&D - Cloud & Infrastructure"
  gpu_compute: {
    rd: '6420', sm: '6150', ga: '6390',
    rdName: 'R&D - Cloud & Infrastructure',
    smName: 'S&M - CRM & Sales Tools',
    gaName: 'G&A - Miscellaneous Expense',
  },
  // Web3 consumption RPC / nodes / indexers / L2 gas → 6425
  web3_rpc: {
    rd: '6425', sm: '6150', ga: '6390',
    rdName: 'R&D - Blockchain & On-chain Services',
    smName: 'S&M - CRM & Sales Tools',
    gaName: 'G&A - Miscellaneous Expense',
  },
  // Web3 SDK / hosted auth / subscription packages → 6430
  web3_subscription: {
    rd: '6430', sm: '6150', ga: '6390',
    rdName: 'R&D - Software & Subscriptions',
    smName: 'S&M - CRM & Sales Tools',
    gaName: 'G&A - Miscellaneous Expense',
  },
  // Company-wide SaaS — routes to G&A 6350 regardless of who paid ("who uses", not "who paid")
  company_saas: {
    rd: '6350', sm: '6350', ga: '6350',
    rdName: 'G&A - Dues & Subscriptions',
    smName: 'G&A - Dues & Subscriptions',
    gaName: 'G&A - Dues & Subscriptions',
  },
  cloud: {
    rd: '6420', sm: '6150', ga: '6390',
    rdName: 'R&D - Cloud & Infrastructure',
    smName: 'S&M - CRM & Sales Tools',
    gaName: 'G&A - Miscellaneous Expense',
  },
  software: {
    rd: '6430', sm: '6150', ga: '6350',
    rdName: 'R&D - Software & Subscriptions',
    smName: 'S&M - CRM & Sales Tools',
    gaName: 'G&A - Dues & Subscriptions',
  },
  kol_marketing: {
    rd: '6490', sm: '6125', ga: '6390',
    rdName: 'R&D - Miscellaneous Expense',
    smName: 'S&M - Influencer & KOL Marketing',
    gaName: 'G&A - Miscellaneous Expense',
  },
  community_rewards: {
    rd: '6490', sm: '6145', ga: '6390',
    rdName: 'R&D - Miscellaneous Expense',
    smName: 'S&M - Community Rewards & Incentives',
    gaName: 'G&A - Miscellaneous Expense',
  },
  advertising: {
    rd: '6490', sm: '6120', ga: '6390',
    rdName: 'R&D - Miscellaneous Expense',
    smName: 'S&M - Digital Advertising',
    gaName: 'G&A - Miscellaneous Expense',
  },
  content_seo: {
    rd: '6490', sm: '6130', ga: '6390',
    rdName: 'R&D - Miscellaneous Expense',
    smName: 'S&M - Content & SEO',
    gaName: 'G&A - Miscellaneous Expense',
  },
  pr_communications: {
    rd: '6490', sm: '6160', ga: '6390',
    rdName: 'R&D - Miscellaneous Expense',
    smName: 'S&M - PR & Communications',
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

// Rule order matters: specific conventions must match BEFORE generic buckets.
// e.g. "notion" should hit company_saas (6350), not software (6430).
//      "openai" should hit ai_api (6435), not cloud (6420).
//      "runpod" should hit gpu_compute (6420 directly), not cloud keyword soup.
//      "kol"/"红包" should hit their own S&M lines (6125/6145), not advertising (6120).
const EXPENSE_TYPE_RULES: ExpenseTypeRule[] = [
  // ── Specific tech conventions (check first) ────────────────────────────
  {
    // "AI model APIs → 6435": OpenAI, Anthropic, OpenRouter, Firecrawl, embedding providers
    expenseType: 'ai_api',
    categories: ['ai_api', 'ai_token'],
    keywords: [
      'openai', 'anthropic', 'claude', 'chatgpt', ' gpt', 'gpt-',
      'openrouter', 'firecrawl',
      'gemini', 'cohere', 'mistral', 'huggingface', 'hugging face',
      'deepseek', 'perplexity', 'replicate', 'together ai',
      '通义', '文心', '智谱',
      'ai api', 'llm', 'embedding', 'text-embedding',
    ],
  },
  {
    // "Pay-per-second GPU rental → 6420": Runpod / Lambda Labs / Vast.ai / SageMaker spot
    expenseType: 'gpu_compute',
    categories: ['gpu_compute', 'gpu'],
    keywords: [
      'runpod', 'lambda labs', 'lambdalabs', 'vast.ai', 'vast ai',
      'sagemaker spot', 'coreweave', 'paperspace', 'gpu rental', 'gpu 租用',
    ],
  },
  {
    // Web3 consumption RPC / nodes / indexers / L2 gas → 6425
    expenseType: 'web3_rpc',
    categories: ['web3_rpc', 'rpc'],
    keywords: [
      'alchemy', 'infura', 'quicknode', 'zan.top', ' zan ',
      'moralis', 'ankr', 'chainstack', 'the graph', 'thegraph',
      'rpc node', 'rpc 节点', 'l2 gas', 'on-chain indexer',
    ],
  },
  {
    // Web3 SDK / hosted auth / subscription → 6430
    expenseType: 'web3_subscription',
    categories: ['web3_subscription'],
    keywords: [
      'privy.io', ' privy', 'walletconnect', 'wallet connect', 'wallet-connect',
      'dynamic.xyz', 'web3auth', 'magic.link', 'thirdweb',
    ],
  },
  {
    // Company-wide SaaS → 6350 (G&A) regardless of who paid
    // Integration guide: "The decision is based on who uses the tool, not who paid"
    expenseType: 'company_saas',
    categories: ['company_saas'],
    keywords: [
      'notion', 'slack', 'zoom', '1password', '1 password',
      'google workspace', 'gsuite', 'g suite', 'google one',
      'microsoft 365', 'office 365', 'm365',
      'dropbox business', 'loom',
    ],
  },
  // ── Travel, meals, office, etc. (unchanged mechanics) ──────────────────
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
  // ── S&M specific conventions ───────────────────────────────────────────
  {
    // KOL / influencer fees → 6125 (must match before 'advertising' 6120)
    expenseType: 'kol_marketing',
    categories: ['kol', 'influencer'],
    keywords: [
      'kol', 'koc', 'influencer', 'creator',
      '达人', '博主', '网红', '主播',
      'sponsorship fee', '达人推广', 'kol 投放',
    ],
  },
  {
    // Red packets / airdrops / community rewards / referral payouts → 6145
    expenseType: 'community_rewards',
    categories: ['red_packet', 'airdrop', 'rewards', 'referral'],
    keywords: [
      '红包', '运营红包', 'airdrop', '空投',
      '社区奖励', '用户奖励', 'community reward', 'referral bonus',
      '邀请奖励', '推荐奖励', 'reward pool', 'incentive pool',
    ],
  },
  {
    // Paid ads (Google / Meta / LinkedIn) — landed on a separate rule from KOL.
    // 'marketing' category still maps here as a best-effort default when no
    // more specific keyword matched.
    expenseType: 'advertising',
    categories: ['marketing', 'advertising'],
    keywords: [
      'google ads', 'google adwords', 'meta ads', 'facebook ads', 'linkedin ads',
      'tiktok ads', '巨量引擎', '腾讯广告',
      '广告', 'advertising', 'promotion', '推广', '营销', 'marketing',
    ],
  },
  {
    expenseType: 'content_seo',
    categories: ['content', 'seo'],
    keywords: [
      '内容', 'content', '文案', 'copywriting', '撰稿', '写作',
      'seo', 'sem', '搜索优化', '搜索引擎',
      '视频制作', '拍摄', 'video production', '素材', '设计外包',
      '博客', 'blog', '文章', 'article',
    ],
  },
  {
    expenseType: 'pr_communications',
    categories: ['pr', 'communications'],
    keywords: [
      '公关', 'pr', 'public relations', '媒体关系', 'media relations',
      '新闻稿', 'press release', '通稿', '媒体', 'media',
      '传播', 'communications', '品牌传播', 'brand communications',
      '外宣', '舆情', '危机公关',
    ],
  },
  // ── Generic cloud / software (catch-alls, must be LAST) ────────────────
  {
    expenseType: 'cloud',
    // 'cloud_resource' is the legacy catch-all for raw compute; leave here.
    // NOTE: 'ai_token' no longer routes here — it's handled by ai_api above.
    categories: ['cloud_resource'],
    keywords: [
      'amazon web services', ' aws ', 'aws,', 'aws.', 'azure',
      'google cloud', ' gcp', 'digitalocean', 'digital ocean',
      'linode', 'vercel', 'cloudflare', 'netlify', 'heroku',
      'render.com', 'fly.io', '阿里云', '腾讯云', '华为云', 'aliyun',
      '云服务', 'cloud server', 'server', '服务器',
    ],
  },
  {
    expenseType: 'software',
    // Team-specific tools (GitHub, Figma, Linear, JetBrains, Jira, etc.)
    // company-wide SaaS is handled earlier by company_saas.
    categories: ['software'],
    keywords: [
      'github', 'gitlab', 'figma', 'linear.app', 'linear ',
      'jira', 'atlassian', 'confluence', 'jetbrains',
      'ahrefs', 'hubspot', 'apollo.io', 'semrush',
      '软件', 'software', 'license', '许可', 'saas', 'subscription', '订阅',
    ],
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
 * @returns { accountCode, accountName, is_fallback, matched_by }
 *
 * is_fallback=true 表示没有精确匹配到任何规则，使用了兜底的 miscellaneous 科目，
 * 财务需要在 Dashboard 的 To-Do 面板中确认或手动更正。
 */
export async function mapExpenseToAccount(
  category: string,
  description: string,
  costCenter?: string | null,
  departmentName?: string | null,
): Promise<{ accountCode: string; accountName: string; is_fallback: boolean; matched_by: 'category' | 'keyword' | 'fallback' }> {
  return mapExpenseWithAccountNameResolver(
    category,
    description,
    costCenter,
    departmentName,
    async (accountCode, fallbackName) => resolveAccountName(accountCode, fallbackName),
  );
}

/**
 * 与 mapExpenseToAccount 共用同一套规则，但由调用方提供科目名称解析器。
 * 可用于批量场景（例如提前加载 syncedAccountMap）避免循环内 N+1 查询。
 */
export async function mapExpenseWithAccountNameResolver(
  category: string,
  description: string,
  costCenter: string | null | undefined,
  departmentName: string | null | undefined,
  resolveName: (accountCode: string, fallbackName: string) => Promise<string>,
): Promise<{ accountCode: string; accountName: string; is_fallback: boolean; matched_by: 'category' | 'keyword' | 'fallback' }> {
  const fn = classifyDepartment(costCenter, departmentName);
  const { expenseType, matched_by } = matchExpenseType(category, description);
  const codes = EXPENSE_TYPE_ACCOUNTS[expenseType];
  let accountCode = codes[fn];
  let fallbackName = codes[`${fn}Name` as keyof AccountCodeSet] as string;
  let isFallback = expenseType === 'miscellaneous';

  // Gate: before emitting to accounting, verify the code is in the canonical CoA.
  // If our rule table drifted away from the live endpoint (new rename / deactivate
  // on the accounting side), degrade to the function's miscellaneous bucket instead
  // of sending something that would warn as "not found in Chart of Accounts".
  if (!(await isKnownAccountCode(accountCode))) {
    const misc = EXPENSE_TYPE_ACCOUNTS.miscellaneous;
    accountCode = misc[fn];
    fallbackName = misc[`${fn}Name` as keyof AccountCodeSet] as string;
    isFallback = true;
  }

  const accountName = await resolveName(accountCode, fallbackName);
  return { accountCode, accountName, is_fallback: isFallback, matched_by };
}

/**
 * 根据 category + description 匹配费用类型。
 *
 * 改动说明（为满足 Mapping conventions）：以前是两遍扫描 —— 先扫所有 rule 的
 * categories，再扫所有 rule 的 keywords，于是一个 `category='marketing'` +
 * `description='KOL 达人推广'` 的条目会先被 advertising(6120) 捕获，落不到
 * 预期的 kol_marketing(6125)。改为单遍扫描：按 rule 列表顺序，每条 rule
 * **同时**看 description 关键词和 category。具体规则（ai_api / gpu_compute /
 * web3_rpc / web3_subscription / company_saas / kol_marketing /
 * community_rewards）都排在通用 cloud / software / advertising 前面，于是
 * 优先命中。
 */
function matchExpenseType(category: string, description: string): { expenseType: ExpenseType; matched_by: 'category' | 'keyword' | 'fallback' } {
  const categoryLower = (category || '').toLowerCase();
  const descLower = (description || '').toLowerCase();

  for (const rule of EXPENSE_TYPE_RULES) {
    for (const keyword of rule.keywords) {
      if (keyword && descLower.includes(keyword.toLowerCase())) {
        return { expenseType: rule.expenseType, matched_by: 'keyword' };
      }
    }
    if (categoryLower && rule.categories.includes(categoryLower)) {
      return { expenseType: rule.expenseType, matched_by: 'category' };
    }
  }

  return { expenseType: 'miscellaneous', matched_by: 'fallback' };
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
): Promise<{ accountCode: string; accountName: string; is_fallback: boolean; matched_by: 'category' | 'keyword' | 'fallback' }[]> {
  return Promise.all(
    items.map(item => mapExpenseToAccount(item.category, item.description, item.costCenter, item.departmentName))
  );
}
