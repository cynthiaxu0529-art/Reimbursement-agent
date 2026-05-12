/**
 * GET /api/accounting-periods
 *
 * 返回本租户的封账状态列表。
 * 不在表里的月份视为 'open'，前端按需自行补全。
 *
 * 仅财务 / super_admin 可见。
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { accountingPeriodClosures, users } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { getUserRoles } from '@/lib/auth/roles';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET() {
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
      id: accountingPeriodClosures.id,
      periodId: accountingPeriodClosures.periodId,
      status: accountingPeriodClosures.status,
      closedAt: accountingPeriodClosures.closedAt,
      closedBy: accountingPeriodClosures.closedBy,
      reason: accountingPeriodClosures.reason,
      updatedAt: accountingPeriodClosures.updatedAt,
    })
    .from(accountingPeriodClosures)
    .where(eq(accountingPeriodClosures.tenantId, session.user.tenantId))
    .orderBy(desc(accountingPeriodClosures.periodId));

  return NextResponse.json({ success: true, data: rows });
}
