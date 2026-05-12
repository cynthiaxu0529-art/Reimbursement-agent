/**
 * 付款状态同步 Cron
 *
 * 每 10 分钟扫一次所有在途 payments，调 Fluxa API 拉最新状态，
 * 回写 payments + reimbursements。跨租户运行。
 *
 * GET /api/cron/sync-payment-status
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * 没这个 cron 之前，付款发起后必须有人手动点「同步状态」才会知道结果，
 * 导致 reimbursements 长期卡在 processing，记账汇总和钱包对账数据失真。
 */

import { NextRequest, NextResponse } from 'next/server';
import { syncInFlightPayments } from '@/lib/payment-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  console.log('[Cron/SyncPaymentStatus] Starting run at', new Date().toISOString());

  // cron 跨租户扫，maxBatch 200 是为了保证单次 < 60s
  const result = await syncInFlightPayments({ maxBatch: 200 });

  const elapsed = Date.now() - startTime;
  console.log(
    '[Cron/SyncPaymentStatus] Done in',
    elapsed,
    'ms — scanned:',
    result.totalScanned,
    'updated:',
    result.totalUpdated,
    'markedPaid:',
    result.markedPaid,
    'rolledBack:',
    result.rolledBack,
    'errors:',
    result.errors,
  );

  return NextResponse.json({
    success: true,
    elapsedMs: elapsed,
    totalScanned: result.totalScanned,
    totalUpdated: result.totalUpdated,
    markedPaid: result.markedPaid,
    rolledBack: result.rolledBack,
    errors: result.errors,
  });
}
