/**
 * 费用冲差详情 API
 *
 * GET    /api/corrections/[id] - 获取冲差详情（含抵扣记录）
 * DELETE /api/corrections/[id] - 取消冲差记录
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';
import { getCorrectionDetail, cancelCorrection } from '@/lib/corrections/correction-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/corrections/[id]
 * 获取冲差详情（含所有抵扣记录）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const [currentUser] = await db
      .select({ role: users.role, roles: users.roles })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const userRoles = getUserRoles(currentUser || {});
    if (!canProcessPayment(userRoles)) {
      return NextResponse.json({ error: '没有权限查看冲差记录' }, { status: 403 });
    }

    const { id } = await params;
    const detail = await getCorrectionDetail(id);

    if (!detail) {
      return NextResponse.json({ error: '冲差记录不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, correction: detail });
  } catch (error) {
    console.error('Get correction detail error:', error);
    return NextResponse.json({ error: '获取冲差详情失败' }, { status: 500 });
  }
}

/**
 * DELETE /api/corrections/[id]
 * 取消冲差记录（仅限未开始抵扣的记录）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const [currentUser] = await db
      .select({ role: users.role, roles: users.roles })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const userRoles = getUserRoles(currentUser || {});
    if (!canProcessPayment(userRoles)) {
      return NextResponse.json({ error: '没有权限取消冲差记录' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const cancelReason = body.cancelReason || '财务主动取消';

    await cancelCorrection(id, cancelReason);

    return NextResponse.json({ success: true, message: '冲差记录已取消' });
  } catch (error) {
    console.error('Cancel correction error:', error);
    const message = error instanceof Error ? error.message : '取消冲差记录失败';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
