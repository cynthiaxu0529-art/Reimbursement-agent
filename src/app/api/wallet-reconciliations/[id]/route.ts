/**
 * GET /api/wallet-reconciliations/[id]
 *
 * 返回某次对账的完整详情：基本信息 + 全部差异 + 关联 payment / reimbursement 摘要。
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
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(
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

  const discrepancies = await db
    .select()
    .from(reconciliationDiscrepancies)
    .where(eq(reconciliationDiscrepancies.reconciliationId, recon.id))
    .orderBy(asc(reconciliationDiscrepancies.createdAt));

  // 拉关联 payment + reimbursement 摘要
  const paymentIds = Array.from(
    new Set(discrepancies.map((d) => d.paymentId).filter(Boolean) as string[]),
  );
  const paymentRows = paymentIds.length
    ? await db
        .select({
          id: payments.id,
          reimbursementId: payments.reimbursementId,
          amount: payments.amount,
          currency: payments.currency,
          txHash: payments.txHash,
          payoutId: payments.payoutId,
          toAddress: payments.toAddress,
          paidAt: payments.paidAt,
          payoutStatus: payments.payoutStatus,
          reimbursementTitle: reimbursements.title,
          reimbursementUserId: reimbursements.userId,
        })
        .from(payments)
        .innerJoin(reimbursements, eq(payments.reimbursementId, reimbursements.id))
        .where(inArray(payments.id, paymentIds))
    : [];

  const userIds = Array.from(new Set(paymentRows.map((p) => p.reimbursementUserId)));
  const userRows = userIds.length
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  const paymentMap = new Map(
    paymentRows.map((p) => [
      p.id,
      {
        ...p,
        employee: userMap.get(p.reimbursementUserId) || null,
      },
    ]),
  );

  return NextResponse.json({
    success: true,
    data: {
      reconciliation: recon,
      discrepancies: discrepancies.map((d) => ({
        ...d,
        payment: d.paymentId ? paymentMap.get(d.paymentId) || null : null,
      })),
    },
  });
}
