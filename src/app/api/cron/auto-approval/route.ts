/**
 * 自动审批 Cron API
 * 每 15 分钟触发一次，执行两件事：
 * 1. 将缓冲期到期的 queued 记录正式执行审批
 * 2. 评估新的待审批步骤，写入 queued
 *
 * GET /api/cron/auto-approval
 * Header: Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { runAutoApprovalEngine } from '@/lib/auto-approval/auto-approval-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  console.log('[Cron/AutoApproval] Starting run at', new Date().toISOString());

  const result = await runAutoApprovalEngine();

  const elapsed = Date.now() - startTime;
  console.log('[Cron/AutoApproval] Done in', elapsed, 'ms:', result);

  return NextResponse.json({
    ok: true,
    elapsed,
    ...result,
  });
}
