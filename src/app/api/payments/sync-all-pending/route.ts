/**
 * POST /api/payments/sync-all-pending
 *
 * 批量同步本租户所有在途 payments 的状态。
 *
 * 仅财务 / super_admin 可用。
 *
 * Body（可选）：
 *   { maxBatch?: number }  默认 200
 *
 * 用途：
 *   - 历史数据修齐（cron 上线前一次性运行）
 *   - 财务在「付款处理」页点「批量同步」按钮触发
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';
import { apiError } from '@/lib/api-error';
import { syncInFlightPayments } from '@/lib/payment-sync';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return apiError('未登录', 401);

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
  const maxBatch: number = Math.min(
    Math.max(parseInt(String(body?.maxBatch ?? 200), 10) || 200, 1),
    500,
  );

  const result = await syncInFlightPayments({
    tenantId: session.user.tenantId,
    maxBatch,
  });

  // 详情不全部回前端（防止数据量爆）—— 只回前 50 条样本
  return NextResponse.json({
    success: true,
    data: {
      totalScanned: result.totalScanned,
      totalUpdated: result.totalUpdated,
      markedPaid: result.markedPaid,
      rolledBack: result.rolledBack,
      errors: result.errors,
      sampleDetails: result.details.slice(0, 50),
    },
  });
}
