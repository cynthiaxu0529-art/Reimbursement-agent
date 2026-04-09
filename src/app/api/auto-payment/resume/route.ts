/**
 * 恢复自动付款（解除紧急暂停）
 * POST /api/auto-payment/resume
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { autoPaymentProfiles, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const [currentUser] = await db
    .select({ role: users.role, roles: users.roles })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!canProcessPayment(getUserRoles(currentUser || {}))) {
    return NextResponse.json({ error: '需要财务或管理员权限' }, { status: 403 });
  }

  await db
    .update(autoPaymentProfiles)
    .set({
      emergencyPause: false,
      emergencyPausedBy: null,
      emergencyPausedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(autoPaymentProfiles.tenantId, session.user.tenantId));

  return NextResponse.json({ ok: true, message: '已恢复自动付款' });
}
