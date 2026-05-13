/**
 * POST /api/wallet-reconciliations/data-anomalies/resolve
 *
 * 给某条异常打"已审核 / 已接受 / 已修复"标记 + 备注。
 * 不动底层数据——纯粹是 review 状态。
 *
 * Body: { anomalyKey: string, status: 'reviewed' | 'accepted' | 'fixed', note: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';
import { apiError } from '@/lib/api-error';
import { reviewAnomaly } from '@/lib/reconciliation/anomaly-detection';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['reviewed', 'accepted', 'fixed']);

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.tenantId) {
    return apiError('未登录', 401);
  }

  const [me] = await db
    .select({ role: users.role, roles: users.roles })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const roles = getUserRoles(me || {});
  if (!canProcessPayment(roles)) {
    return apiError('需要财务或超级管理员权限', 403);
  }

  const body = await request.json().catch(() => ({}));
  const anomalyKey: string = (body?.anomalyKey || '').toString();
  const status: string = (body?.status || '').toString();
  const note: string = (body?.note || '').toString().slice(0, 1000);

  if (!anomalyKey) return apiError('缺少 anomalyKey', 400, 'MISSING_FIELD');
  if (!ALLOWED.has(status)) {
    return apiError(`status 必须是 reviewed / accepted / fixed`, 400, 'INVALID_STATUS');
  }
  if ((status === 'accepted' || status === 'fixed') && !note.trim()) {
    return apiError(`status=${status} 必须填写说明（审计要求）`, 400, 'NOTE_REQUIRED');
  }

  await reviewAnomaly({
    tenantId: session.user.tenantId,
    anomalyKey,
    status: status as 'reviewed' | 'accepted' | 'fixed',
    note,
    userId: session.user.id,
  });

  return NextResponse.json({ success: true });
}
