/**
 * 报销单类目下拉的运行时数据源。
 *
 * 数据源：
 *   1. /api/chart-of-accounts —— 真实科目列表（由后端从 Accounting Agent
 *      /api/external/chart-of-accounts 同步）。
 *   2. /api/user/cost-center  —— 当前登录用户的 cost center（rd/sm/ga）。
 *
 * 解析规则（与服务端 `mapExpenseToAccount` 保持一致）：
 *   每个 UX 类目映射到一个 ExpenseType（'travel' / 'meals' / 'ai_api' …）。
 *   GL code = EXPENSE_TYPE_ACCOUNTS[expenseType][costCenter]
 *   然后用 CoA 同步表里的 account_name 覆盖显示名。
 *
 * 这让下拉显示的 code 跟该员工提交后服务端真正落账的 code 完全一致：
 *   - COO（cost_center='ga'）看到 "✈️ 机票 · 6270 G&A - Travel & Entertainment"
 *   - R&D 工程师（'rd'）看到 "✈️ 机票 · 6440 R&D - Travel & Entertainment"
 *   - 销售（'sm'）看到 "✈️ 机票 · 6170 S&M - Travel & Entertainment"
 *
 * 例外：服务端 `mapExpenseToAccount` 还会按 description 关键字覆盖（比如带
 * "KOL" 的描述强制走 6125），UI 没法预知，这种情况下落账码会跟下拉显示不
 * 一致，最终以服务端为准。
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { EXPENSE_TYPE_ACCOUNTS, type ExpenseType, type ExpenseFunction } from '@/lib/accounting/account-rules';

export interface ChartOfAccountsGroup {
  account_subtype: string;
  accounts: { accountCode: string; accountName: string }[];
}

export interface ExpenseCategoryOption {
  value: string;          // ExpenseCategory enum value（flight/hotel/meal/...）
  label: string;          // 中文标签（短）
  icon: string;
  expenseType: ExpenseType;
  // 当前用户实际会落到的 account_code（按 cost center 解析）
  resolvedCode?: string;
  resolvedName?: string;
  accountSubtype?: string;
}

const COST_CENTER_TO_SUBTYPE: Record<ExpenseFunction, string> = {
  rd: 'Research & Development',
  sm: 'Sales & Marketing',
  ga: 'General & Administrative',
};

interface UxCategory {
  value: string;
  label: string;
  icon: string;
  expenseType: ExpenseType;
}

/**
 * UX 类目模板 —— 每条挂到一个 ExpenseType；GL code 在运行时按
 * 用户 cost_center 解析。
 */
const CATEGORY_TEMPLATE: UxCategory[] = [
  // 差旅
  { value: 'flight',               label: '机票',          icon: '✈️',  expenseType: 'travel' },
  { value: 'train',                label: '火车票',        icon: '🚄',  expenseType: 'travel' },
  { value: 'hotel',                label: '酒店住宿',      icon: '🏨',  expenseType: 'travel' },
  { value: 'taxi',                 label: '市内交通',      icon: '🚕',  expenseType: 'travel' },
  // 餐饮 / 招待
  { value: 'meal',                 label: '餐饮',          icon: '🍽️', expenseType: 'meals' },
  { value: 'client_entertainment', label: '客户招待',      icon: '🤝',  expenseType: 'meals' },
  // 办公
  { value: 'office_supplies',      label: '办公用品',      icon: '📎',  expenseType: 'office_supplies' },
  // 公司级 SaaS（固定 6350 G&A，跟付款人部门无关）
  { value: 'company_saas',         label: '公司级 SaaS',   icon: '🏢',  expenseType: 'company_saas' },
  // 技术
  { value: 'ai_api',               label: 'AI API 服务',   icon: '🤖',  expenseType: 'ai_api' },
  { value: 'ai_token',             label: 'AI 服务 (旧)',  icon: '🤖',  expenseType: 'ai_api' },
  { value: 'gpu_compute',          label: 'GPU 算力',      icon: '🖥️',  expenseType: 'gpu_compute' },
  { value: 'web3_rpc',             label: 'Web3 RPC/节点', icon: '🔗',  expenseType: 'web3_rpc' },
  { value: 'web3_subscription',    label: 'Web3 订阅',     icon: '🧩',  expenseType: 'web3_subscription' },
  { value: 'cloud_resource',       label: '云资源',        icon: '☁️',  expenseType: 'cloud' },
  { value: 'software',             label: '团队软件',      icon: '💿',  expenseType: 'software' },
  // S&M
  { value: 'kol',                  label: 'KOL / KOC 投放', icon: '📣', expenseType: 'kol_marketing' },
  { value: 'red_packet',           label: '运营红包 / 空投', icon: '🧧', expenseType: 'community_rewards' },
  { value: 'marketing',            label: '付费广告',      icon: '📢',  expenseType: 'advertising' },
  { value: 'content_seo',          label: '内容 & SEO',    icon: '📝',  expenseType: 'content_seo' },
  { value: 'pr_communications',    label: '公关 & 传播',   icon: '📰',  expenseType: 'pr_communications' },
  // 培训 / 会议
  { value: 'training',             label: '培训费',        icon: '📚',  expenseType: 'training' },
  { value: 'conference',           label: '会议 / 活动',   icon: '🎤',  expenseType: 'training' },
  // 行政
  { value: 'courier',              label: '快递费',        icon: '📦',  expenseType: 'shipping' },
  { value: 'phone',                label: '通讯费',        icon: '📱',  expenseType: 'telecom' },
  // 兜底
  { value: 'other',                label: '其他',          icon: '📋',  expenseType: 'miscellaneous' },
];

interface UseExpenseCategoriesResult {
  options: ExpenseCategoryOption[];
  groups: ChartOfAccountsGroup[];
  /** 当前用户的 cost center（rd/sm/ga）。未知时为 null —— 此时按 ga 兜底。 */
  costCenter: ExpenseFunction | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// 缓存：同一次页面会话内多个 hook 实例共享，避免重复网络。
let coaCache: { groups: ChartOfAccountsGroup[]; at: number } | null = null;
let costCenterCache: { value: ExpenseFunction | null; at: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min（integration guide 允许 ≤ 1h）

export function useExpenseCategories(): UseExpenseCategoriesResult {
  const [groups, setGroups] = useState<ChartOfAccountsGroup[]>(
    coaCache ? coaCache.groups : [],
  );
  const [costCenter, setCostCenter] = useState<ExpenseFunction | null>(
    costCenterCache ? costCenterCache.value : null,
  );
  const [loading, setLoading] = useState<boolean>(!coaCache || !costCenterCache);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const now = Date.now();
    const coaFresh = coaCache && now - coaCache.at < CACHE_TTL_MS && tick === 0;
    const ccFresh = costCenterCache && now - costCenterCache.at < CACHE_TTL_MS && tick === 0;

    if (coaFresh && ccFresh) {
      setGroups(coaCache!.groups);
      setCostCenter(costCenterCache!.value);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const coaPromise = coaFresh
      ? Promise.resolve({ groups: coaCache!.groups })
      : fetch('/api/chart-of-accounts', { credentials: 'same-origin' })
          .then(async (res) => {
            if (!res.ok) throw new Error(`CoA HTTP ${res.status}`);
            return res.json() as Promise<{ groups: ChartOfAccountsGroup[] }>;
          });

    const ccPromise = ccFresh
      ? Promise.resolve({ costCenter: costCenterCache!.value })
      : fetch('/api/user/cost-center', { credentials: 'same-origin' })
          .then(async (res) => {
            if (!res.ok) throw new Error(`cost-center HTTP ${res.status}`);
            return res.json() as Promise<{ costCenter: ExpenseFunction | null }>;
          });

    Promise.allSettled([coaPromise, ccPromise])
      .then(([coaSettled, ccSettled]) => {
        if (cancelled) return;

        // CoA 是必需的：失败就报错，下拉空。
        if (coaSettled.status === 'fulfilled') {
          const coaResult = coaSettled.value;
          coaCache = { groups: coaResult.groups, at: Date.now() };
          setGroups(coaResult.groups);
        } else {
          const msg = (coaSettled.reason as Error)?.message || 'CoA 加载失败';
          setError(msg);
        }

        // Cost center 是优化项：失败时降级到 ga（与服务端
        // classifyDepartment 默认一致），不阻断下拉。
        if (ccSettled.status === 'fulfilled') {
          const ccResult = ccSettled.value;
          costCenterCache = { value: ccResult.costCenter ?? null, at: Date.now() };
          setCostCenter(ccResult.costCenter ?? null);
        } else {
          console.warn(
            '[useExpenseCategories] cost-center fetch failed; falling back to ga:',
            (ccSettled.reason as Error)?.message,
          );
          costCenterCache = { value: null, at: Date.now() };
          setCostCenter(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const options = useMemo<ExpenseCategoryOption[]>(() => {
    // accountCode → {name, subtype} 查找表
    const flat = new Map<string, { name: string; subtype: string }>();
    for (const g of groups) {
      for (const a of g.accounts) {
        flat.set(a.accountCode, { name: a.accountName, subtype: g.account_subtype });
      }
    }

    // 未知 cost center 时兜底到 'ga'（与服务端 classifyDepartment 一致）
    const fn: ExpenseFunction = costCenter ?? 'ga';

    const out: ExpenseCategoryOption[] = [];
    for (const opt of CATEGORY_TEMPLATE) {
      const codeSet = EXPENSE_TYPE_ACCOUNTS[opt.expenseType];
      const resolvedCode = codeSet[fn];
      // 该 code 不在最新 CoA 中（被会计端禁用 / 改名）时，下拉里隐掉这条
      // —— 出口端也会被 isKnownAccountCode gate 拦住降级到 misc。
      const info = flat.get(resolvedCode);
      if (!info) continue;
      out.push({
        ...opt,
        resolvedCode,
        resolvedName: info.name,
        accountSubtype: info.subtype || COST_CENTER_TO_SUBTYPE[fn],
      });
    }
    return out;
  }, [groups, costCenter]);

  return {
    options,
    groups,
    costCenter,
    loading,
    error,
    refetch: () => setTick((t) => t + 1),
  };
}
