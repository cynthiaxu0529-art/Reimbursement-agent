/**
 * GET /api/chart-of-accounts
 *
 * 从本地 synced_accounts 返回科目表（由 chart-of-accounts-sync 从
 * Accounting Agent 的 /api/external/chart-of-accounts 同步而来）。
 * 供内部前端下拉使用 —— UI 必须从此端点取值，不再维护硬编码列表。
 *
 * 按 integration guide 的 "Integration requirements"，响应按 account_subtype
 * 分组；每项包含 account_code + account_name（务必保留真实 name）。
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  ensureAccountsSynced,
  getAccountsGroupedBySubtype,
} from '@/lib/accounting/chart-of-accounts-sync';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    await ensureAccountsSynced();
    const grouped = await getAccountsGroupedBySubtype();

    const groups = Object.entries(grouped).map(([subtype, accounts]) => ({
      account_subtype: subtype,
      accounts,
    }));

    const response = NextResponse.json({
      success: true,
      groups,
      count: groups.reduce((n, g) => n + g.accounts.length, 0),
    });
    // short-TTL cache per integration guide (≤ 1 hour)
    response.headers.set('Cache-Control', 'private, max-age=600');
    return response;
  } catch (error) {
    console.error('[chart-of-accounts] fetch failed:', error);
    return NextResponse.json(
      { error: '获取科目表失败' },
      { status: 500 },
    );
  }
}
