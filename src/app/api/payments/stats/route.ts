import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, users } from '@/lib/db/schema';
import { eq, and, sql, gte, lt } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/**
 * GET /api/payments/stats
 * 获取付款统计数据（财务角色使用）
 * 返回：处理中数量、今日已付数量
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 权限检查：从数据库查询当前用户角色
    const [currentUser] = await db.select({ role: users.role, roles: users.roles })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const userRoles = getUserRoles(currentUser || {});
    if (!canProcessPayment(userRoles)) {
      return NextResponse.json({ error: '没有权限查看付款统计' }, { status: 403 });
    }

    const tenantId = session.user.tenantId;

    // 获取今天的开始和结束时间（UTC）
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // 查询处理中的报销单数量
    const processingResult = await db.select({
      count: sql<number>`count(*)::int`,
    })
      .from(reimbursements)
      .where(and(
        eq(reimbursements.tenantId, tenantId),
        eq(reimbursements.status, 'processing')
      ));

    const processingCount = processingResult[0]?.count || 0;

    // 查询今日已付的报销单数量
    const todayPaidResult = await db.select({
      count: sql<number>`count(*)::int`,
    })
      .from(reimbursements)
      .where(and(
        eq(reimbursements.tenantId, tenantId),
        eq(reimbursements.status, 'paid'),
        gte(reimbursements.paidAt, todayStart),
        lt(reimbursements.paidAt, todayEnd)
      ));

    const todayPaidCount = todayPaidResult[0]?.count || 0;

    return NextResponse.json({
      success: true,
      stats: {
        processingCount,
        todayPaidCount,
      },
    });
  } catch (error) {
    console.error('Get payment stats error:', error);
    return NextResponse.json({
      success: false,
      error: '获取统计数据失败',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
