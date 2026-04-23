/**
 * 报销单类目下拉的运行时数据源。
 *
 * 从 /api/chart-of-accounts 拉取真实科目列表（后端从 Accounting Agent
 * 的 /api/external/chart-of-accounts 同步）。每个 UX 类目只在其
 * 对应的 canonical 科目存在于 CoA 时才会出现在下拉里——这让下拉的
 * 内容**由 /api/external/chart-of-accounts 的返回实时决定**，
 * 也符合 integration guide "Integration requirements" 的 #1。
 *
 * 结构：UX 类目保留（配图标/中文标签），但列表成员由 CoA 决定。
 * 每个 option 同时显示 UX 标签与对应的 account_code—account_name，
 * 方便员工直观看到落到哪个科目。
 */

'use client';

import { useEffect, useMemo, useState } from 'react';

export interface ChartOfAccountsGroup {
  account_subtype: string;
  accounts: { accountCode: string; accountName: string }[];
}

export interface ExpenseCategoryOption {
  value: string;          // ExpenseCategory enum value — 维持内部 UX 分类（flight/hotel/meal...）
  label: string;          // 中文标签（短）
  icon: string;
  // 该 UX 类目可能落到的 canonical account codes（任一存在于 CoA 即视为可用）
  canonicalCodes: string[];
  // 在 CoA 中实际可用的 account_code（按优先级取第一个命中）
  resolvedCode?: string;
  resolvedName?: string;
  accountSubtype?: string;
}

/**
 * UX 类目模板 —— 字段说明见 ExpenseCategoryOption。
 * canonicalCodes 列出该 UX 类目可能落到的 CoA 科目（跨 R&D / S&M / G&A）。
 * 实际展示时会用当前 CoA 过滤掉不存在的 code。
 */
const CATEGORY_TEMPLATE: ExpenseCategoryOption[] = [
  { value: 'flight',               label: '机票',         icon: '✈️', canonicalCodes: ['6440', '6170', '6270'] },
  { value: 'train',                label: '火车票',       icon: '🚄', canonicalCodes: ['6440', '6170', '6270'] },
  { value: 'hotel',                label: '酒店住宿',     icon: '🏨', canonicalCodes: ['6440', '6170', '6270'] },
  { value: 'meal',                 label: '餐饮',         icon: '🍽️', canonicalCodes: ['6450', '6180', '6280'] },
  { value: 'taxi',                 label: '市内交通',     icon: '🚕', canonicalCodes: ['6440', '6170', '6270'] },
  { value: 'office_supplies',      label: '办公用品',     icon: '📎', canonicalCodes: ['6410', '6230', '6190'] },
  // Company-wide SaaS → 6350 regardless of who paid
  { value: 'company_saas',         label: '公司级 SaaS',  icon: '🏢', canonicalCodes: ['6350'] },
  // AI APIs → 6435
  { value: 'ai_api',               label: 'AI API 服务',  icon: '🤖', canonicalCodes: ['6435', '6150', '6350'] },
  // Legacy alias: items stored with category='ai_token' from before the split
  // still need a human-readable label in the dropdown / getCategoryLabel().
  { value: 'ai_token',             label: 'AI 服务 (旧)',  icon: '🤖', canonicalCodes: ['6435', '6150', '6350'] },
  // GPU 算力 → 6420
  { value: 'gpu_compute',          label: 'GPU 算力',      icon: '🖥️', canonicalCodes: ['6420'] },
  // Web3 RPC / nodes → 6425
  { value: 'web3_rpc',             label: 'Web3 RPC/节点', icon: '🔗', canonicalCodes: ['6425'] },
  // Web3 SDK / subscription → 6430
  { value: 'web3_subscription',    label: 'Web3 订阅',    icon: '🧩', canonicalCodes: ['6430'] },
  // Cloud (generic) → 6420 / 6150
  { value: 'cloud_resource',       label: '云资源',        icon: '☁️', canonicalCodes: ['6420', '6150', '6390'] },
  { value: 'software',             label: '团队软件',      icon: '💿', canonicalCodes: ['6430', '6150', '6350'] },
  // S&M
  { value: 'kol',                  label: 'KOL / KOC 投放', icon: '📣', canonicalCodes: ['6125'] },
  { value: 'red_packet',           label: '运营红包 / 空投', icon: '🧧', canonicalCodes: ['6145'] },
  { value: 'marketing',            label: '付费广告',      icon: '📢', canonicalCodes: ['6120'] },
  { value: 'content_seo',          label: '内容 & SEO',    icon: '📝', canonicalCodes: ['6130'] },
  { value: 'pr_communications',    label: '公关 & 传播',   icon: '📰', canonicalCodes: ['6160'] },
  { value: 'training',             label: '培训费',        icon: '📚', canonicalCodes: ['6470', '6140', '6330'] },
  { value: 'conference',           label: '会议 / 活动',   icon: '🎤', canonicalCodes: ['6470', '6140', '6330'] },
  { value: 'client_entertainment', label: '客户招待',      icon: '🤝', canonicalCodes: ['6450', '6180', '6280'] },
  { value: 'courier',              label: '快递费',        icon: '📦', canonicalCodes: ['6490', '6190', '6370'] },
  { value: 'phone',                label: '通讯费',        icon: '📱', canonicalCodes: ['6490', '6190', '6290'] },
  { value: 'other',                label: '其他',          icon: '📋', canonicalCodes: ['6490', '6190', '6390'] },
];

interface UseExpenseCategoriesResult {
  options: ExpenseCategoryOption[];
  groups: ChartOfAccountsGroup[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

let cache: { groups: ChartOfAccountsGroup[]; at: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min — integration guide allows ≤ 1h

export function useExpenseCategories(): UseExpenseCategoriesResult {
  const [groups, setGroups] = useState<ChartOfAccountsGroup[]>(
    cache ? cache.groups : [],
  );
  const [loading, setLoading] = useState<boolean>(!cache);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (cache && Date.now() - cache.at < CACHE_TTL_MS && tick === 0) {
      setGroups(cache.groups);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetch('/api/chart-of-accounts', { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { groups: ChartOfAccountsGroup[] }) => {
        if (cancelled) return;
        cache = { groups: data.groups, at: Date.now() };
        setGroups(data.groups);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const options = useMemo<ExpenseCategoryOption[]>(() => {
    // 先把 CoA 扁平化成 accountCode → {name, subtype} 查找表
    const flat = new Map<string, { name: string; subtype: string }>();
    for (const g of groups) {
      for (const a of g.accounts) {
        flat.set(a.accountCode, { name: a.accountName, subtype: g.account_subtype });
      }
    }

    const out: ExpenseCategoryOption[] = [];
    for (const opt of CATEGORY_TEMPLATE) {
      // 按 canonicalCodes 的优先级取第一个在 CoA 中存在的 code
      const hit = opt.canonicalCodes.find((code) => flat.has(code));
      if (!hit) continue;
      const info = flat.get(hit)!;
      out.push({
        ...opt,
        resolvedCode: hit,
        resolvedName: info.name,
        accountSubtype: info.subtype,
      });
    }
    return out;
  }, [groups]);

  return { options, groups, loading, error, refetch: () => setTick((t) => t + 1) };
}
