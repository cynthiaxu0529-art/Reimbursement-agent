/**
 * POST /api/wallet-reconciliations/data-anomalies/force-paid
 *
 * 强制把 reimbursement 标 paid。
 * 用于 succeeded_but_not_paid 异常的"手动修复"操作（批量同步漏修的边角情况）。
 *
 * Body: { reimbursementId: string, anomalyKey: string, note: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';
import { apiError } from '@/lib/api-error';
import {
  forceMarkReimbursementPaid,
  reviewAnomaly,
} from '@/lib/reconciliation/anomaly-detection';

export const dynamic = 'force-dynamic';

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
  const reimbursementId: string = (body?.reimbursementId || '').toString();
  const anomalyKey: string = (body?.anomalyKey || '').toString();
  const note: string = (body?.note || '').toString().trim().slice(0, 1000);

  if (!reimbursementId) return apiError('缺少 reimbursementId', 400);
  if (!anomalyKey) return apiError('缺少 anomalyKey', 400);
  if (!note) return apiError('强制标 paid 必须填写说明（审计要求）', 400);

  const result = await forceMarkReimbursementPaid({
    tenantId: session.user.tenantId,
    reimbursementId,
  });

  if (!result.updated) {
    return apiError('未能更新——可能 reimbursement 已是 paid 状态，或不属于本租户', 409);
  }

  await reviewAnomaly({
    tenantId: session.user.tenantId,
    anomalyKey,
    status: 'fixed',
    note: `[已强制标 paid] ${note}`,
    userId: session.user.id,
  });

  return NextResponse.json({ success: true });
}
