/**
 * 自动付款 Cron API
 * 每 15 分钟触发一次
 * 检查已审批通过、满足付款条件的报销单，自动发起 Fluxa 打款
 *
 * GET /api/cron/auto-payment
 * Header: Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { runAutoPaymentEngine } from '@/lib/auto-payment/auto-payment-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  console.log('[Cron/AutoPayment] Starting run at', new Date().toISOString());

  const result = await runAutoPaymentEngine();

  const elapsed = Date.now() - startTime;
  console.log('[Cron/AutoPayment] Done in', elapsed, 'ms:', result);

  return NextResponse.json({
    ok: true,
    elapsed,
    ...result,
  });
}
