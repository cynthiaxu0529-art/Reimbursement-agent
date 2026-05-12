/**
 * POST /api/wallet-reconciliations/[id]/period-summary/[periodId]/review
 *
 * 财务对某个月份的差异做处理标记。
 * - status: 'reviewed' = 已审核（差异已了解，可能还需后续动作）
 *           'accepted' = 接受差异（合理差异，不再追究，审计可见）
 *           'unreviewed' = 撤回审核状态
 *
 * Body: { status: 'unreviewed' | 'reviewed' | 'accepted', note?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  walletReconciliations,
  walletReconciliationPeriodNotes,
  users,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

const PERIOD_ID_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ALLOWED_STATUSES = new Set(['unreviewed', 'reviewed', 'accepted']);

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; periodId: string } },
) {
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

  if (!PERIOD_ID_RE.test(params.periodId)) {
    return apiError('period_id 格式应为 YYYY-MM', 400, 'INVALID_PERIOD_ID');
  }

  const body = await request.json().catch(() => ({}));
  const status: string = (body?.status || 'reviewed').toString();
  const note: string = (body?.note || '').toString().slice(0, 1000);

  if (!ALLOWED_STATUSES.has(status)) {
    return apiError(`status 必须是 ${Array.from(ALLOWED_STATUSES).join(' / ')}`, 400, 'INVALID_STATUS');
  }

  // 校验 reconciliation 归属
  const [recon] = await db
    .select({ id: walletReconciliations.id })
    .from(walletReconciliations)
    .where(
      and(
        eq(walletReconciliations.id, params.id),
        eq(walletReconciliations.tenantId, session.user.tenantId),
      ),
    )
    .limit(1);
  if (!recon) return apiError('对账记录不存在', 404, 'NOT_FOUND');

  const now = new Date();
  const reviewedBy = status === 'unreviewed' ? null : session.user.id;
  const reviewedAt = status === 'unreviewed' ? null : now;

  // Upsert：每 (reconciliation, period) 一行
  const [existing] = await db
    .select()
    .from(walletReconciliationPeriodNotes)
    .where(
      and(
        eq(walletReconciliationPeriodNotes.reconciliationId, recon.id),
        eq(walletReconciliationPeriodNotes.periodId, params.periodId),
      ),
    )
    .limit(1);

  let row;
  if (existing) {
    [row] = await db
      .update(walletReconciliationPeriodNotes)
      .set({
        status,
        note: note || null,
        reviewedBy,
        reviewedAt,
        updatedAt: now,
      })
      .where(eq(walletReconciliationPeriodNotes.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(walletReconciliationPeriodNotes)
      .values({
        reconciliationId: recon.id,
        tenantId: session.user.tenantId,
        periodId: params.periodId,
        status,
        note: note || null,
        reviewedBy,
        reviewedAt,
      })
      .returning();
  }

  return NextResponse.json({ success: true, data: row });
}
