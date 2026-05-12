/**
 * POST /api/accounting-periods/[periodId]/unlock
 *
 * 把已封账的月份解锁。仅 super_admin 可用。
 * 解锁要求填明确的 reason（审计可见）。
 *
 * Body: { reason: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  accountingPeriodClosures,
  periodClosureAuditLog,
  users,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getUserRoles } from '@/lib/auth/roles';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

const PERIOD_ID_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function POST(
  request: NextRequest,
  { params }: { params: { periodId: string } },
) {
  const session = await auth();
  if (!session?.user?.tenantId) return apiError('未登录', 401);

  const [me] = await db
    .select({ role: users.role, roles: users.roles, email: users.email })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const roles = getUserRoles(me || {});
  if (!roles.includes('super_admin')) {
    return apiError('解锁操作需要 super_admin 权限', 403);
  }

  if (!PERIOD_ID_RE.test(params.periodId)) {
    return apiError('period_id 格式应为 YYYY-MM', 400, 'INVALID_PERIOD_ID');
  }

  const body = await request.json().catch(() => ({}));
  const reason: string = (body?.reason || '').toString().trim().slice(0, 1000);
  if (!reason) {
    return apiError('解锁必须填写原因（审计要求）', 400, 'REASON_REQUIRED');
  }

  const [existing] = await db
    .select()
    .from(accountingPeriodClosures)
    .where(
      and(
        eq(accountingPeriodClosures.tenantId, session.user.tenantId),
        eq(accountingPeriodClosures.periodId, params.periodId),
      ),
    )
    .limit(1);

  if (!existing || existing.status !== 'locked') {
    return apiError('该期间未封账，无需解锁', 409, 'NOT_LOCKED');
  }

  const prevState = {
    status: existing.status,
    closedAt: existing.closedAt,
    closedBy: existing.closedBy,
    reason: existing.reason,
  };

  const now = new Date();
  const [row] = await db
    .update(accountingPeriodClosures)
    .set({
      status: 'open',
      closedAt: null,
      closedBy: null,
      reason: null,
      updatedAt: now,
    })
    .where(eq(accountingPeriodClosures.id, existing.id))
    .returning();

  await db.insert(periodClosureAuditLog).values({
    tenantId: session.user.tenantId,
    periodId: params.periodId,
    action: 'unlocked',
    actorUserId: session.user.id,
    actorEmailSnapshot: me?.email || session.user.email || '',
    reason,
    prevState,
    newState: { status: 'open' },
  });

  return NextResponse.json({ success: true, data: row });
}
