/**
 * POST /api/wallet-reconciliations/data-anomalies/rollback-paid
 *
 * 把 reimbursement 从 paid 回滚到 approved。
 * 用于 failed_but_paid 异常的"确认应当回滚"操作。
 *
 * Body: { reimbursementId: string, anomalyKey: string, note: string }
 *
 * 同时把 anomaly 标 'fixed' + 备注。
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';
import { apiError } from '@/lib/api-error';
import {
  rollbackReimbursementToApproved,
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
  // 回滚是高敏感操作，强制 super_admin
  if (!roles.includes('super_admin')) {
    return apiError('回滚需要 super_admin 权限', 403);
  }

  const body = await request.json().catch(() => ({}));
  const reimbursementId: string = (body?.reimbursementId || '').toString();
  const anomalyKey: string = (body?.anomalyKey || '').toString();
  const note: string = (body?.note || '').toString().trim().slice(0, 1000);

  if (!reimbursementId) return apiError('缺少 reimbursementId', 400);
  if (!anomalyKey) return apiError('缺少 anomalyKey', 400);
  if (!note) return apiError('回滚必须填写说明（审计要求）', 400);

  const result = await rollbackReimbursementToApproved({
    tenantId: session.user.tenantId,
    reimbursementId,
  });

  if (!result.updated) {
    return apiError('未能回滚——可能 reimbursement 已不是 paid 状态，或不属于本租户', 409);
  }

  // 标记异常为 fixed
  await reviewAnomaly({
    tenantId: session.user.tenantId,
    anomalyKey,
    status: 'fixed',
    note: `[已回滚 paid → approved] ${note}`,
    userId: session.user.id,
  });

  return NextResponse.json({ success: true });
}
