/**
 * GET /api/wallet-reconciliations/[id]/period-summary
 *
 * 返回某次钱包对账的"按期对账总览"——每个月一行，比较：
 *   - 钱包 CSV 该月实付总额 (wallet_outflow_total)
 *   - 系统 payments 该月 succeeded 总额 (system_payments_total)
 *   - 系统 reimbursement_items 该月 booked 入账总额 (system_booked_total)
 *   - 三个口径之间的差异（diff_payments, diff_booked）
 *
 * 同时拉同 reconciliation 下每个月的 review 状态 + note，给 UI 展示。
 *
 * 仅财务 / super_admin 可见。
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
import { computePeriodSummary, type PeriodSummaryWithReview } from '@/lib/reconciliation/period-summary';
import type { FluxaCsvRow } from '@/lib/reconciliation/csv-parser';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
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

  // 校验 reconciliation 归属本租户
  const [recon] = await db
    .select()
    .from(walletReconciliations)
    .where(
      and(
        eq(walletReconciliations.id, params.id),
        eq(walletReconciliations.tenantId, session.user.tenantId),
      ),
    )
    .limit(1);
  if (!recon) return apiError('对账记录不存在', 404, 'NOT_FOUND');

  const csvRows = (recon.rawRows as FluxaCsvRow[]) || [];
  if (csvRows.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  // 算 per-month summary
  const periods = await computePeriodSummary(session.user.tenantId, csvRows);

  // 拉本 reconciliation 下已有的 period notes，merge 上去
  const notes = await db
    .select({
      periodId: walletReconciliationPeriodNotes.periodId,
      status: walletReconciliationPeriodNotes.status,
      note: walletReconciliationPeriodNotes.note,
      reviewedBy: walletReconciliationPeriodNotes.reviewedBy,
      reviewedAt: walletReconciliationPeriodNotes.reviewedAt,
    })
    .from(walletReconciliationPeriodNotes)
    .where(eq(walletReconciliationPeriodNotes.reconciliationId, recon.id));
  const noteMap = new Map(notes.map(n => [n.periodId, n]));

  const result: PeriodSummaryWithReview[] = periods.map(p => {
    const note = noteMap.get(p.periodId);
    return {
      ...p,
      reviewStatus: (note?.status as PeriodSummaryWithReview['reviewStatus']) || 'unreviewed',
      reviewNote: note?.note ?? null,
      reviewedBy: note?.reviewedBy ?? null,
      reviewedAt: note?.reviewedAt?.toISOString() ?? null,
    };
  });

  return NextResponse.json({ success: true, data: result });
}
