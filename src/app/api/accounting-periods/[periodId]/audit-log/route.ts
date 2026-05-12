/**
 * GET /api/accounting-periods/[periodId]/audit-log
 *
 * 返回某月份的封账操作审计历史（最新在前）。
 * 仅财务 / super_admin 可见。
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { periodClosureAuditLog, users } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getUserRoles } from '@/lib/auth/roles';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { periodId: string } },
) {
  const session = await auth();
  if (!session?.user?.tenantId) return apiError('未登录', 401);

  const [me] = await db
    .select({ role: users.role, roles: users.roles })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const roles = getUserRoles(me || {});
  const hasAccess = roles.some(r => ['finance', 'super_admin', 'admin'].includes(r));
  if (!hasAccess) return apiError('需要财务或管理员权限', 403);

  const rows = await db
    .select({
      id: periodClosureAuditLog.id,
      action: periodClosureAuditLog.action,
      actorUserId: periodClosureAuditLog.actorUserId,
      actorEmailSnapshot: periodClosureAuditLog.actorEmailSnapshot,
      reason: periodClosureAuditLog.reason,
      prevState: periodClosureAuditLog.prevState,
      newState: periodClosureAuditLog.newState,
      createdAt: periodClosureAuditLog.createdAt,
    })
    .from(periodClosureAuditLog)
    .where(
      and(
        eq(periodClosureAuditLog.tenantId, session.user.tenantId),
        eq(periodClosureAuditLog.periodId, params.periodId),
      ),
    )
    .orderBy(desc(periodClosureAuditLog.createdAt));

  return NextResponse.json({ success: true, data: rows });
}
