/**
 * Service Account 吊销接口
 *
 * POST /api/service-accounts/:id/revoke - 吊销指定 service account
 *
 * 需要管理员权限（Session 登录）
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { serviceAccounts, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserRoles, isAdmin } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 检查管理员权限
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });
    if (!currentUser || !isAdmin(getUserRoles(currentUser))) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const { id } = params;
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || 'Revoked by admin';

    // 查找 service account
    const account = await db.query.serviceAccounts.findFirst({
      where: eq(serviceAccounts.id, id),
    });

    if (!account) {
      return NextResponse.json({ error: 'Service Account 不存在' }, { status: 404 });
    }

    if (account.revokedAt) {
      return NextResponse.json({ error: 'Service Account 已被吊销' }, { status: 400 });
    }

    // 执行吊销
    await db.update(serviceAccounts)
      .set({
        isActive: false,
        revokedAt: new Date(),
        revokeReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(serviceAccounts.id, id));

    return NextResponse.json({
      success: true,
      message: `Service account "${account.serviceName}" 已吊销`,
    });
  } catch (error) {
    console.error('Revoke service account error:', error);
    return NextResponse.json({ error: '吊销 Service Account 失败' }, { status: 500 });
  }
}
