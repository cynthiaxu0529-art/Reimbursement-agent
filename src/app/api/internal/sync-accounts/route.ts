/**
 * 内部 API：触发科目表同步
 *
 * POST /api/internal/sync-accounts
 *
 * 可被 cron job 或管理员手动调用，从 Accounting Agent 同步最新科目表。
 * 需要管理员 session 认证。
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserRoles, isAdmin } from '@/lib/auth/roles';
import { syncChartOfAccounts } from '@/lib/accounting/chart-of-accounts-sync';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });
    if (!currentUser || !isAdmin(getUserRoles(currentUser))) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const result = await syncChartOfAccounts();

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Sync accounts error:', error);
    return NextResponse.json({ error: '同步科目表失败' }, { status: 500 });
  }
}
