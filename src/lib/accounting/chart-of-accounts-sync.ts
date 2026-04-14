/**
 * Chart of Accounts 同步服务
 *
 * 启动时从 Accounting Agent 同步费用科目表到本地 synced_accounts 表。
 * 如果 Accounting Agent 不可用，使用 fallback 硬编码科目映射。
 * 支持定期刷新（每天一次）。
 */

import { db } from '@/lib/db';
import { syncedAccounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// ============================================================================
// 类型定义
// ============================================================================

export interface AccountingAccount {
  account_code: string;
  account_name: string;
  account_type: string;
  account_subtype: string;
}

interface SyncResult {
  success: boolean;
  source: 'remote' | 'fallback';
  accountCount: number;
  error?: string;
}

// ============================================================================
// Fallback 硬编码科目表
// ============================================================================

const FALLBACK_ACCOUNTS: AccountingAccount[] = [
  // ── R&D 研发费用 ──
  { account_code: '6410', account_name: 'R&D - Salaries & Benefits', account_type: 'Expense', account_subtype: 'Research & Development' },
  { account_code: '6420', account_name: 'R&D - Cloud & Infrastructure', account_type: 'Expense', account_subtype: 'Research & Development' },
  { account_code: '6430', account_name: 'R&D - Software & Subscriptions', account_type: 'Expense', account_subtype: 'Research & Development' },
  { account_code: '6440', account_name: 'R&D - Travel & Entertainment', account_type: 'Expense', account_subtype: 'Research & Development' },
  { account_code: '6450', account_name: 'R&D - Meals & Entertainment', account_type: 'Expense', account_subtype: 'Research & Development' },
  { account_code: '6460', account_name: 'R&D - Office Supplies', account_type: 'Expense', account_subtype: 'Research & Development' },
  { account_code: '6470', account_name: 'R&D - Training & Conferences', account_type: 'Expense', account_subtype: 'Research & Development' },
  { account_code: '6490', account_name: 'R&D - Miscellaneous Expense', account_type: 'Expense', account_subtype: 'Research & Development' },
  // ── S&M 销售费用 ──
  { account_code: '6100', account_name: 'S&M - Sales Salaries & Commissions', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6110', account_name: 'S&M - Marketing Salaries', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6120', account_name: 'S&M - Digital Advertising', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6130', account_name: 'S&M - Content & SEO', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6140', account_name: 'S&M - Events & Conferences', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6150', account_name: 'S&M - CRM & Sales Tools', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6160', account_name: 'S&M - PR & Communications', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6170', account_name: 'S&M - Travel & Entertainment', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6180', account_name: 'S&M - Meals & Entertainment', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  { account_code: '6190', account_name: 'S&M - Miscellaneous Expense', account_type: 'Expense', account_subtype: 'Sales & Marketing' },
  // ── G&A 管理费用 ──
  { account_code: '6220', account_name: 'G&A - Rent & Facilities', account_type: 'Expense', account_subtype: 'General & Administrative' },
  { account_code: '6230', account_name: 'G&A - Office Supplies', account_type: 'Expense', account_subtype: 'General & Administrative' },
  { account_code: '6240', account_name: 'G&A - Insurance', account_type: 'Expense', account_subtype: 'General & Administrative' },
  { account_code: '6270', account_name: 'G&A - Travel & Entertainment', account_type: 'Expense', account_subtype: 'General & Administrative' },
  { account_code: '6280', account_name: 'G&A - Meals & Entertainment', account_type: 'Expense', account_subtype: 'General & Administrative' },
  { account_code: '6290', account_name: 'G&A - Telephone & Internet', account_type: 'Expense', account_subtype: 'General & Administrative' },
  { account_code: '6330', account_name: 'G&A - Training & Development', account_type: 'Expense', account_subtype: 'General & Administrative' },
  { account_code: '6370', account_name: 'G&A - Shipping & Postage', account_type: 'Expense', account_subtype: 'General & Administrative' },
  { account_code: '6390', account_name: 'G&A - Miscellaneous Expense', account_type: 'Expense', account_subtype: 'General & Administrative' },
];

// ============================================================================
// 同步逻辑
// ============================================================================

/**
 * 从 Accounting Agent 同步科目表
 * 如果连不上，使用 fallback 硬编码科目
 */
export async function syncChartOfAccounts(): Promise<SyncResult> {
  const accountingAgentUrl = process.env.ACCOUNTING_AGENT_URL;
  const accountingAgentApiKey = process.env.ACCOUNTING_AGENT_API_KEY;

  // 尝试从远程同步
  if (accountingAgentUrl && accountingAgentApiKey) {
    try {
      const url = `${accountingAgentUrl}/api/external/chart-of-accounts?type=Expense`;
      const response = await fetch(url, {
        headers: {
          'X-Service-Key': accountingAgentApiKey,
        },
        signal: AbortSignal.timeout(10000), // 10 秒超时
      });

      if (response.ok) {
        const result = await response.json();
        const accounts: AccountingAccount[] = result.data || [];

        if (accounts.length > 0) {
          await upsertAccounts(accounts);
          console.log(`[COA Sync] Synced ${accounts.length} accounts from Accounting Agent`);
          return { success: true, source: 'remote', accountCount: accounts.length };
        }
      } else {
        console.warn(`[COA Sync] Accounting Agent returned ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.warn('[COA Sync] Failed to connect to Accounting Agent:', (error as Error).message);
    }
  } else {
    console.warn('[COA Sync] ACCOUNTING_AGENT_URL or ACCOUNTING_AGENT_API_KEY not configured');
  }

  // Fallback: 使用硬编码科目
  console.log('[COA Sync] Using fallback chart of accounts');
  await upsertAccounts(FALLBACK_ACCOUNTS);
  return { success: true, source: 'fallback', accountCount: FALLBACK_ACCOUNTS.length };
}

/**
 * Upsert 科目到数据库
 */
async function upsertAccounts(accounts: AccountingAccount[]): Promise<void> {
  for (const account of accounts) {
    const existing = await db.query.syncedAccounts.findFirst({
      where: eq(syncedAccounts.accountCode, account.account_code),
    });

    if (existing) {
      await db.update(syncedAccounts)
        .set({
          accountName: account.account_name,
          accountSubtype: account.account_subtype,
          syncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(syncedAccounts.accountCode, account.account_code));
    } else {
      await db.insert(syncedAccounts).values({
        accountCode: account.account_code,
        accountName: account.account_name,
        accountSubtype: account.account_subtype,
        syncedAt: new Date(),
      });
    }
  }
}

/**
 * 获取本地缓存的科目表
 */
export async function getLocalAccounts(): Promise<{ accountCode: string; accountName: string; accountSubtype: string | null }[]> {
  return db.query.syncedAccounts.findMany({
    columns: {
      accountCode: true,
      accountName: true,
      accountSubtype: true,
    },
  });
}

/**
 * 根据 account_code 获取科目名称
 */
export async function getAccountName(accountCode: string): Promise<string | null> {
  const account = await db.query.syncedAccounts.findFirst({
    where: eq(syncedAccounts.accountCode, accountCode),
  });
  return account?.accountName || null;
}

// ============================================================================
// 定期同步
// ============================================================================

let lastSyncTime: Date | null = null;
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * 检查是否需要刷新，如果需要则同步
 */
export async function ensureAccountsSynced(): Promise<void> {
  const now = new Date();
  if (!lastSyncTime || (now.getTime() - lastSyncTime.getTime()) > SYNC_INTERVAL_MS) {
    await syncChartOfAccounts();
    lastSyncTime = now;
  }
}
