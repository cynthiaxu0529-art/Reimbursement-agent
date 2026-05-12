/**
 * POST /api/accounting-periods/[periodId]/close
 *
 * 把某个月份封账。仅 super_admin 可用。
 * Body: { reason?: string }
 *
 * 副作用：
 *   - 写一行 accounting_period_closures（upsert，status='locked'）
 *   - 写一行 period_closure_audit_log（action='locked'）
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
  // 封账只能 super_admin 来做（per 用户决定）
  if (!roles.includes('super_admin')) {
    return apiError('封账操作需要 super_admin 权限', 403);
  }

  if (!PERIOD_ID_RE.test(params.periodId)) {
    return apiError('period_id 格式应为 YYYY-MM', 400, 'INVALID_PERIOD_ID');
  }

  const body = await request.json().catch(() => ({}));
  const reason: string = (body?.reason || '').toString().slice(0, 1000);

  // 查现状
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

  if (existing?.status === 'locked') {
    return apiError('该期间已经封账', 409, 'ALREADY_LOCKED');
  }

  const now = new Date();
  const prevState = existing
    ? { status: existing.status, closedAt: existing.closedAt, reason: existing.reason }
    : null;

  let row;
  if (existing) {
    [row] = await db
      .update(accountingPeriodClosures)
      .set({
        status: 'locked',
        closedAt: now,
        closedBy: session.user.id,
        reason: reason || null,
        updatedAt: now,
      })
      .where(eq(accountingPeriodClosures.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(accountingPeriodClosures)
      .values({
        tenantId: session.user.tenantId,
        periodId: params.periodId,
        status: 'locked',
        closedAt: now,
        closedBy: session.user.id,
        reason: reason || null,
      })
      .returning();
  }

  // 审计日志
  await db.insert(periodClosureAuditLog).values({
    tenantId: session.user.tenantId,
    periodId: params.periodId,
    action: 'locked',
    actorUserId: session.user.id,
    actorEmailSnapshot: me?.email || session.user.email || '',
    reason: reason || null,
    prevState,
    newState: { status: 'locked', closedAt: now.toISOString(), reason: reason || null },
  });

  return NextResponse.json({ success: true, data: row });
}
