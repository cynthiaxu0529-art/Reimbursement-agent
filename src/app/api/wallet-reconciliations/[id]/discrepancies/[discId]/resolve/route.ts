/**
 * POST /api/wallet-reconciliations/[id]/discrepancies/[discId]/resolve
 *
 * 财务把一条差异标为已处理，附带说明。
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  walletReconciliations,
  reconciliationDiscrepancies,
  users,
} from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; discId: string } },
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

  const body = await request.json().catch(() => ({}));
  const note: string = (body?.note || '').toString().slice(0, 1000);
  const unresolve: boolean = !!body?.unresolve;

  // 校验对账归属租户
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

  const [updated] = await db
    .update(reconciliationDiscrepancies)
    .set({
      resolved: !unresolve,
      resolvedBy: unresolve ? null : session.user.id,
      resolvedAt: unresolve ? null : new Date(),
      resolutionNote: unresolve ? null : note,
    })
    .where(
      and(
        eq(reconciliationDiscrepancies.id, params.discId),
        eq(reconciliationDiscrepancies.reconciliationId, recon.id),
      ),
    )
    .returning();

  if (!updated) return apiError('差异记录不存在', 404, 'NOT_FOUND');

  return NextResponse.json({ success: true, data: updated });
}
