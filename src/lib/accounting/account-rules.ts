/**
 * 会计科目 / 费用映射的「单一真相源」
 *
 * 故意做成纯数据文件（无 db / 无 server-only 依赖），这样 client component
 * 和 server-side mapping 函数都能 import 同一份常量。
 *
 * 任何科目编号或映射规则的修改都必须改这里——`expense-account-mapping.ts`
 * 和 `chart-of-accounts-sync.ts` 都从这里 re-export 给原调用方用，
 * UI 页（accounting-summaries 等）也直接 import 这里，避免两边漂移。
 *
 * S&M 编号 2025 年迁移过一次（见 drizzle/0011_migrate_sm_coa_codes.sql），
 * 旧编号 6130(Travel)/6140(Meals)/6160(Training) 都不要再用。
 */

// ============================================================================
// 类型
// ============================================================================

export type ExpenseFunction = 'rd' | 'sm' | 'ga';

export type ExpenseType =
  | 'travel'
  | 'meals'
  | 'office_supplies'
  | 'training'
  | 'shipping'
  | 'telecom'
  | 'insurance'
  | 'ai_api'
  | 'gpu_compute'
  | 'web3_rpc'
  | 'web3_subscription'
  | 'company_saas'
  | 'cloud'
  | 'software'
  | 'kol_marketing'
  | 'community_rewards'
  | 'advertising'
  | 'content_seo'
  | 'pr_communications'
  | 'miscellaneous';

export interface AccountCodeSet {
  rd: string;
  sm: string;
  ga: string;
  rdName: string;
  smName: string;
  gaName: string;
}

export interface AccountingAccount {
  account_code: string;
  account_name: string;
  account_type: string;
  /**
   * Canonical 三类是 Research & Development / Sales & Marketing /
   * General & Administrative，但 Accounting Agent 返回任意字符串，
   * 类型保持 string 让运行时数据能直接喂进来。
   */
  account_subtype: string;
}

// ============================================================================
// 费用类型 → 科目代码（按费用性质分列）
// ============================================================================

export const EXPENSE_TYPE_ACCOUNTS: Record<ExpenseType, AccountCodeSet> = {
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
  ai_api: {
    // Locked per integration guide Mapping conventions #4:
    // "Anything billed as an LLM / AI API … goes to 6435 R&D - AI & API Services."
    rd: '6435', sm: '6435', ga: '6435',
    rdName: 'R&D - AI & API Services',
    smName: 'R&D - AI & API Services',
    gaName: 'R&D - AI & API Services',
  },
  gpu_compute: {
    // Locked per Mapping conventions #3:
    // "Pay-per-second GPU rental … goes to 6420 R&D - Cloud & Infrastructure
    //  — same bucket as production cloud hosting, not as a separate account."
    rd: '6420', sm: '6420', ga: '6420',
    rdName: 'R&D - Cloud & Infrastructure',
    smName: 'R&D - Cloud & Infrastructure',
    gaName: 'R&D - Cloud & Infrastructure',
  },
  web3_rpc: {
    // Locked per Mapping conventions #2 (Web3 consumption RPC / nodes / indexers).
    rd: '6425', sm: '6425', ga: '6425',
    rdName: 'R&D - Blockchain & On-chain Services',
    smName: 'R&D - Blockchain & On-chain Services',
    gaName: 'R&D - Blockchain & On-chain Services',
  },
  web3_subscription: {
    // Locked per Mapping conventions #2 (Web3 SDK / hosted auth / subscription).
    rd: '6430', sm: '6430', ga: '6430',
    rdName: 'R&D - Software & Subscriptions',
    smName: 'R&D - Software & Subscriptions',
    gaName: 'R&D - Software & Subscriptions',
  },
  company_saas: {
    // Locked per Mapping conventions #1 (company-wide SaaS → G&A regardless of payer).
    rd: '6350', sm: '6350', ga: '6350',
    rdName: 'G&A - Dues & Subscriptions',
    smName: 'G&A - Dues & Subscriptions',
    gaName: 'G&A - Dues & Subscriptions',
  },
  cloud: {
    // Generic cloud (AWS / GCP / Vercel for hosting) still splits by payer team.
    // GPU-specific compute is captured separately by `gpu_compute` (locked R&D).
    rd: '6420', sm: '6150', ga: '6390',
    rdName: 'R&D - Cloud & Infrastructure',
    smName: 'S&M - CRM & Sales Tools',
    gaName: 'G&A - Miscellaneous Expense',
  },
  software: {
    // Contract explicitly splits by team: R&D-only tools (GitHub/Figma/Linear) →
    // 6430; S&M-only tools (Ahrefs/HubSpot/Apollo) → 6150; company-wide is
    // captured separately by `company_saas`.
    rd: '6430', sm: '6150', ga: '6350',
    rdName: 'R&D - Software & Subscriptions',
    smName: 'S&M - CRM & Sales Tools',
    gaName: 'G&A - Dues & Subscriptions',
  },
  kol_marketing: {
    // Locked per Mapping conventions #5 (S&M top-level account, not split by payer).
    rd: '6125', sm: '6125', ga: '6125',
    rdName: 'S&M - Influencer & KOL Marketing',
    smName: 'S&M - Influencer & KOL Marketing',
    gaName: 'S&M - Influencer & KOL Marketing',
  },
  community_rewards: {
    // Locked per Mapping conventions #5 (red packets / airdrops / referral payouts).
    rd: '6145', sm: '6145', ga: '6145',
    rdName: 'S&M - Community Rewards & Incentives',
    smName: 'S&M - Community Rewards & Incentives',
    gaName: 'S&M - Community Rewards & Incentives',
  },
  advertising: {
    // Locked per Mapping conventions #5 (paid ads — Google / Meta / LinkedIn).
    rd: '6120', sm: '6120', ga: '6120',
    rdName: 'S&M - Digital Advertising',
    smName: 'S&M - Digital Advertising',
    gaName: 'S&M - Digital Advertising',
  },
  content_seo: {
    // Locked per Mapping conventions #5 (content production / SEO are S&M spend).
    rd: '6130', sm: '6130', ga: '6130',
    rdName: 'S&M - Content & SEO',
    smName: 'S&M - Content & SEO',
    gaName: 'S&M - Content & SEO',
  },
  pr_communications: {
    // Locked per Mapping conventions #5 (PR agency / press releases are S&M spend).
    rd: '6160', sm: '6160', ga: '6160',
    rdName: 'S&M - PR & Communications',
    smName: 'S&M - PR & Communications',
    gaName: 'S&M - PR & Communications',
  },
  miscellaneous: {
    rd: '6490', sm: '6190', ga: '6390',
    rdName: 'R&D - Miscellaneous Expense',
    smName: 'S&M - Miscellaneous Expense',
    gaName: 'G&A - Miscellaneous Expense',
  },
};

// ============================================================================
// CoA fallback —— Accounting Agent 不可达时使用
// 字段与运行时同步表 synced_accounts 严格对齐
// ============================================================================

export const FALLBACK_ACCOUNTS: AccountingAccount[] = [
  // ── R&D ──
  { account_code: '6410', account_name: 'R&D - Office Supplies', account_type: 'Expense', account_subtype: 'Research & Development' },
  { account_code: '6420', account_name: 'R&D - Cloud & Infrastructure', account_type: 'Expense', account_subtype: 'Research & Development' },
  { account_code: '6425', account_name: 'R&D - Blockchain & On-chain Services', account_type: 'Expense', account_subtype: 'Research & Development' },
  { account_code: '6430', account_name: 'R&D - Software & Subscriptions', account_type: 'Expense', account_subtype: 'Research & Development' },
  { account_code: '6435', account_name: 'R&D - AI & API Services', account_type: 'Expense', account_subtype: 'Research & Development' },
  { account_code: '6440', account_name: 'R&D - Travel & Entertainment', account_type: 'Expense', account_subtype: 'Research & Development' },
  { account_code: '6450', account_name: 'R&D - Meals & Entertainment', account_type: 'Expense', account_subtype: 'Research & Development' },
  { account_code: '6460', account_name: 'R&D - Equipment & Hardware', account_type: 'Expense', account_subtype: 'Research & Development' },
  { account_code: '6470', account_name: 'R&D - Training & Conferences', account_type: 'Expense', account_subtype: 'Research & Development' },
  { account_code: '6480', account_name: 'R&D - Dues & Subscriptions', account_type: 'Expense', account_subtype: 'Research & Development' },
  { account_code: '6490', account_name: 'R&D - Miscellaneous Expense', account_type: 'Expense', account_subtype: 'Research & Development' },
  // ── S&M (post-migration: 0011_migrate_sm_coa_codes.sql) ──
  { account_code: '6100', account_name: 'S&M - Sales Salaries & Commissions', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6110', account_name: 'S&M - Marketing Salaries', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6120', account_name: 'S&M - Digital Advertising', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6125', account_name: 'S&M - Influencer & KOL Marketing', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6130', account_name: 'S&M - Content & SEO', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6140', account_name: 'S&M - Events & Conferences', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6145', account_name: 'S&M - Community Rewards & Incentives', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6150', account_name: 'S&M - CRM & Sales Tools', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6160', account_name: 'S&M - PR & Communications', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6170', account_name: 'S&M - Travel & Entertainment', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6180', account_name: 'S&M - Meals & Entertainment', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6190', account_name: 'S&M - Miscellaneous Expense', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  // ── G&A ──
  { account_code: '6220', account_name: 'G&A - Rent & Facilities', account_type: 'Expense', account_subtype: 'General & Administrative' },
  { account_code: '6230', account_name: 'G&A - Office Supplies', account_type: 'Expense', account_subtype: 'General & Administrative' },
  { account_code: '6240', account_name: 'G&A - Insurance', account_type: 'Expense', account_subtype: 'General & Administrative' },
  { account_code: '6270', account_name: 'G&A - Travel & Entertainment', account_type: 'Expense', account_subtype: 'General & Administrative' },
  { account_code: '6280', account_name: 'G&A - Meals & Entertainment', account_type: 'Expense', account_subtype: 'General & Administrative' },
  { account_code: '6290', account_name: 'G&A - Telephone & Internet', account_type: 'Expense', account_subtype: 'General & Administrative' },
  { account_code: '6330', account_name: 'G&A - Training & Development', account_type: 'Expense', account_subtype: 'General & Administrative' },
  { account_code: '6350', account_name: 'G&A - Dues & Subscriptions', account_type: 'Expense', account_subtype: 'General & Administrative' },
  { account_code: '6370', account_name: 'G&A - Shipping & Postage', account_type: 'Expense', account_subtype: 'General & Administrative' },
  { account_code: '6390', account_name: 'G&A - Miscellaneous Expense', account_type: 'Expense', account_subtype: 'General & Administrative' },
];

// ============================================================================
// UI 展示用：映射规则行（accounting-summaries 页的"映射规则表"用）
//
// 每一行 = 一个 ExpenseType + 该类型在 R&D / S&M / G&A 下落到的 code。
// 排序按一般业务直觉：差旅/餐饮/办公在前，技术类居中，营销类靠后，杂项收尾。
// ============================================================================

export interface ExpenseRuleDisplayRow {
  expenseType: string;       // 中英展示标签
  categories: string;        // 触发该规则的 category / 关键词，给财务参考
  expenseTypeKey: ExpenseType;
}

export const EXPENSE_RULES_DISPLAY: ExpenseRuleDisplayRow[] = [
  { expenseTypeKey: 'travel',            expenseType: '差旅 Travel',         categories: 'taxi, flight, train, hotel, car_rental, fuel, parking, toll' },
  { expenseTypeKey: 'meals',             expenseType: '餐饮 Meals',          categories: 'meal, client_entertainment' },
  { expenseTypeKey: 'office_supplies',   expenseType: '办公用品 Office',     categories: 'office_supplies, equipment, printing' },
  { expenseTypeKey: 'training',          expenseType: '培训 / 会议 Training', categories: 'training, conference' },
  { expenseTypeKey: 'ai_api',            expenseType: 'AI API 服务',         categories: 'ai_api, ai_token (旧)' },
  { expenseTypeKey: 'gpu_compute',       expenseType: 'GPU 算力',            categories: 'gpu_compute, gpu' },
  { expenseTypeKey: 'web3_rpc',          expenseType: 'Web3 RPC/节点',       categories: 'web3_rpc' },
  { expenseTypeKey: 'web3_subscription', expenseType: 'Web3 订阅',          categories: 'web3_subscription' },
  { expenseTypeKey: 'company_saas',      expenseType: '公司级 SaaS',         categories: 'company_saas (固定走 G&A 6350)' },
  { expenseTypeKey: 'cloud',             expenseType: '云资源 Cloud',        categories: 'cloud_resource' },
  { expenseTypeKey: 'software',          expenseType: '团队软件 Software',   categories: 'software' },
  { expenseTypeKey: 'kol_marketing',     expenseType: 'KOL / KOC 投放',      categories: 'kol, influencer (关键词: 达人/博主/网红)' },
  { expenseTypeKey: 'community_rewards', expenseType: '运营红包 / 空投',     categories: 'red_packet, airdrop, rewards, referral' },
  { expenseTypeKey: 'advertising',       expenseType: '付费广告 Advertising', categories: 'marketing, advertising' },
  { expenseTypeKey: 'content_seo',       expenseType: '内容 & SEO',          categories: 'content, seo' },
  { expenseTypeKey: 'pr_communications', expenseType: '公关 & 传播',         categories: 'pr, communications' },
  { expenseTypeKey: 'shipping',          expenseType: '快递 Shipping',       categories: 'courier' },
  { expenseTypeKey: 'telecom',           expenseType: '通讯 Telecom',        categories: 'phone, internet' },
  { expenseTypeKey: 'insurance',         expenseType: '保险 Insurance',      categories: '(关键词: 保险/insurance)' },
  { expenseTypeKey: 'miscellaneous',     expenseType: '其他 Misc',           categories: '(default 兜底)' },
];

// ============================================================================
// UI 辅助：把 account_subtype 映射到短显示名 (R&D / S&M / G&A)
// ============================================================================

export const SUBTYPE_TO_GROUP: Record<string, 'R&D' | 'S&M' | 'G&A'> = {
  'Research & Development': 'R&D',
  'Sales & Marketing': 'S&M',
  'General & Administrative': 'G&A',
};
