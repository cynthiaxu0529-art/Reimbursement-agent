/**
 * POST /api/wallet-reconciliations/[id]/rerun
 *
 * 用 raw_rows 里的原始 CSV 数据重新跑一遍匹配。
 * 适用场景：补了某个 payment 的 txHash 之后想看新结果，不想重传 CSV。
 *
 * 重跑会清掉旧的 discrepancies，并保留 resolved=true 的处理记录到一个 jsonb 备注里
 * （避免财务的标记被一键抹掉）。
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  walletReconciliations,
  reconciliationDiscrepancies,
  payments,
  reimbursements,
  users,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';
import { apiError } from '@/lib/api-error';
import {
  matchPaymentsAgainstCsv,
  DEFAULT_TOLERANCE,
  type PaymentRecord,
  type ToleranceConfig,
} from '@/lib/reconciliation/match';
import type { FluxaCsvRow } from '@/lib/reconciliation/csv-parser';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
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
    return apiError('该对账没有原始数据，无法重跑', 400, 'NO_RAW_DATA');
  }

  const tolerance: ToleranceConfig = {
    ...DEFAULT_TOLERANCE,
    ...(recon.toleranceConfig as Partial<ToleranceConfig> || {}),
  };

  // 拉本租户所有 succeeded fluxa payments
  const allPayments = await db
    .select({ payment: payments })
    .from(payments)
    .innerJoin(reimbursements, eq(payments.reimbursementId, reimbursements.id))
    .where(
      and(
        eq(reimbursements.tenantId, session.user.tenantId),
        eq(payments.payoutStatus, 'succeeded'),
        eq(payments.paymentProvider, 'fluxa'),
      ),
    );

  const paymentRecords: PaymentRecord[] = allPayments.map((row) => ({
    id: row.payment.id,
    reimbursementId: row.payment.reimbursementId,
    payoutId: row.payment.payoutId,
    txHash: row.payment.txHash,
    toAddress: row.payment.toAddress,
    amount: row.payment.amount,
    currency: row.payment.currency,
    paidAt: row.payment.paidAt,
    payoutStatus: row.payment.payoutStatus,
  }));

  const matchResult = matchPaymentsAgainstCsv(paymentRecords, csvRows, tolerance);

  // 保留已 resolved 的处理记录 —— 重跑后如果同样的差异再次出现，
  // 把 resolved 标记继承过来（按 type + paymentId + csvRowIndex 三元组匹配）
  const previousResolved = await db
    .select()
    .from(reconciliationDiscrepancies)
    .where(
      and(
        eq(reconciliationDiscrepancies.reconciliationId, recon.id),
        eq(reconciliationDiscrepancies.resolved, true),
      ),
    );

  type ResolvedKey = string;
  const resolvedKey = (d: { type: string; paymentId: string | null; csvRowIndex: number | null }) =>
    `${d.type}::${d.paymentId || ''}::${d.csvRowIndex ?? ''}`;
  const carryOver = new Map<ResolvedKey, typeof previousResolved[number]>();
  for (const r of previousResolved) carryOver.set(resolvedKey(r), r);

  // 删旧 discrepancies
  await db
    .delete(reconciliationDiscrepancies)
    .where(eq(reconciliationDiscrepancies.reconciliationId, recon.id));

  if (matchResult.discrepancies.length > 0) {
    await db.insert(reconciliationDiscrepancies).values(
      matchResult.discrepancies.map((d) => {
        const key = `${d.type}::${d.paymentId || ''}::${d.csvRowIndex ?? ''}`;
        const prev = carryOver.get(key);
        return {
          reconciliationId: recon.id,
          tenantId: session.user.tenantId!,
          type: d.type,
          paymentId: d.paymentId || null,
          csvRowIndex: d.csvRowIndex ?? null,
          csvRowSnapshot: d.csvRowSnapshot || null,
          matchedBy: d.matchedBy || null,
          matchConfidence: d.matchConfidence || null,
          details: d.details,
          resolved: prev?.resolved || false,
          resolvedBy: prev?.resolvedBy || null,
          resolvedAt: prev?.resolvedAt || null,
          resolutionNote: prev?.resolutionNote || null,
        };
      }),
    );
  }

  // 更新汇总
  const [updated] = await db
    .update(walletReconciliations)
    .set({
      matchedCount: matchResult.matchedCount,
      matchedAmount: matchResult.matchedAmount,
      discrepancyCount: matchResult.discrepancies.length,
      csvTotalAmount: matchResult.csvTotalAmount,
      updatedAt: new Date(),
    })
    .where(eq(walletReconciliations.id, recon.id))
    .returning();

  return NextResponse.json({
    success: true,
    data: {
      id: updated.id,
      rowCount: updated.rowCount,
      matchedCount: updated.matchedCount,
      discrepancyCount: updated.discrepancyCount,
      csvTotalAmount: updated.csvTotalAmount,
      matchedAmount: updated.matchedAmount,
    },
  });
}
