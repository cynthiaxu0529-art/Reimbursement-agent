/**
 * 缓冲期内取消自动审批
 * POST /api/auto-approval/cancel
 * Body: { logId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { autoApprovalLogs } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const { logId } = await request.json();
  if (!logId) {
    return NextResponse.json({ error: '缺少 logId' }, { status: 400 });
  }

  const [log] = await db
    .select()
    .from(autoApprovalLogs)
    .where(
      and(
        eq(autoApprovalLogs.id, logId),
        eq(autoApprovalLogs.approverId, session.user.id),
        eq(autoApprovalLogs.decision, 'queued')
      )
    )
    .limit(1);

  if (!log) {
    return NextResponse.json({ error: '未找到可取消的自动审批记录' }, { status: 404 });
  }

  const now = new Date();

  // 检查是否还在缓冲期内
  if (log.cancelWindowEndsAt && log.cancelWindowEndsAt <= now) {
    return NextResponse.json({ error: '缓冲期已结束，无法取消' }, { status: 400 });
  }

  await db
    .update(autoApprovalLogs)
    .set({
      decision: 'cancelled',
      cancelledByUserId: session.user.id,
      cancelledAt: now,
    })
    .where(eq(autoApprovalLogs.id, logId));

  return NextResponse.json({ ok: true, message: '已取消自动审批，该报销单将转为人工审批' });
}
