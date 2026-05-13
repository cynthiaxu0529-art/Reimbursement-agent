/**
 * GET /api/wallet-reconciliations/data-anomalies
 *
 * 扫描本租户 payments × reimbursements 一致性，返回所有数据异常。
 *
 * 5 种异常类型：
 *   - failed_but_paid       payment 失败但 reimb 标 paid
 *   - succeeded_but_not_paid payment 成功但 reimb 没标 paid
 *   - rejected_with_inflight reimb 已驳回但 payment 还在途
 *   - paid_no_payment       reimb 标 paid 但无任何 payment 记录
 *   - multiple_succeeded    一个 reimb 有多笔 succeeded payment
 *
 * 仅财务 / super_admin 可见。
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';
import { apiError } from '@/lib/api-error';
import { detectAnomalies } from '@/lib/reconciliation/anomaly-detection';

export const dynamic = 'force-dynamic';

export async function GET() {
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

  const anomalies = await detectAnomalies(session.user.tenantId);

  // 按类型聚合一份统计给 UI
  const byType: Record<string, number> = {};
  let totalUnreviewed = 0;
  for (const a of anomalies) {
    byType[a.type] = (byType[a.type] || 0) + 1;
    if (!a.review) totalUnreviewed += 1;
  }

  return NextResponse.json({
    success: true,
    data: {
      anomalies,
      summary: {
        total: anomalies.length,
        unreviewed: totalUnreviewed,
        byType,
      },
    },
  });
}
