/**
 * Chart of Accounts 同步服务
 *
 * 启动时从 Accounting Agent 同步费用科目表到本地 synced_accounts 表。
 * 如果 Accounting Agent 不可用，使用 fallback 硬编码科目映射。
 * 支持定期刷新（每天一次）。
 */

import { db } from '@/lib/db';
import { syncedAccounts } from '@/lib/db/schema';
import { eq, notInArray } from 'drizzle-orm';
// FALLBACK_ACCOUNTS + AccountingAccount 已迁移到 account-rules（单一真相源，纯数据无 db 依赖）
// 这里 re-export 让原有 import 路径继续工作。
import { FALLBACK_ACCOUNTS, type AccountingAccount } from './account-rules';
export { FALLBACK_ACCOUNTS };
export type { AccountingAccount };

interface SyncResult {
  success: boolean;
  source: 'remote' | 'fallback';
  accountCount: number;
  error?: string;
}

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
  const incomingCodes = accounts.map(a => a.account_code);

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

  // 清理远端已移除的科目，避免本地残留过期 code
  if (incomingCodes.length > 0) {
    await db
      .delete(syncedAccounts)
      .where(notInArray(syncedAccounts.accountCode, incomingCodes));
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

/**
 * 判断 account_code 是否存在于已同步的 Chart of Accounts。
 * 出口前用它做 gate：未命中说明本地规则与权威 CoA 漂移，需要降级 + 告警。
 */
export async function isKnownAccountCode(accountCode: string): Promise<boolean> {
  if (!accountCode) return false;
  const account = await db.query.syncedAccounts.findFirst({
    where: eq(syncedAccounts.accountCode, accountCode),
  });
  return !!account;
}

/**
 * 以 account_subtype 分组的科目列表，供前端 / API 下拉直接消费。
 * UI 必须按 subtype 做分组（见 integration guide "Integration requirements"），
 * 不要再用 account_code 前缀去重新发明分组。
 */
export async function getAccountsGroupedBySubtype(): Promise<
  Record<string, { accountCode: string; accountName: string }[]>
> {
  const rows = await db.query.syncedAccounts.findMany({
    columns: { accountCode: true, accountName: true, accountSubtype: true },
  });
  const groups: Record<string, { accountCode: string; accountName: string }[]> = {};
  for (const row of rows) {
    const key = row.accountSubtype || 'Uncategorized';
    (groups[key] ??= []).push({ accountCode: row.accountCode, accountName: row.accountName });
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  }
  return groups;
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
