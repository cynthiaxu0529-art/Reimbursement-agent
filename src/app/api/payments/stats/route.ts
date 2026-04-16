import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, advances, users } from '@/lib/db/schema';
import { eq, and, sql, gte, lt, or, isNull, inArray } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/**
 * GET /api/payments/stats
 * 获取付款统计数据（财务角色使用）
 * 返回：待付款总额、处理中数量、今日已付数量、已付总数
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 从数据库查询用户角色和 tenantId（以 DB 为准，避免 JWT 缓存导致 tenantId 过期或为空）
    const [currentUser] = await db.select({ role: users.role, roles: users.roles, tenantId: users.tenantId })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!currentUser) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }

    const userRoles = getUserRoles(currentUser);
    if (!canProcessPayment(userRoles)) {
      return NextResponse.json({ error: '没有权限查看付款统计' }, { status: 403 });
    }

    const tenantId = currentUser.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: '无法获取租户信息' }, { status: 400 });
    }

    // 获取今天的开始和结束时间（UTC）
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // 同租户用户 ID 列表（用于包含 tenantId=null 的历史游离报销）
    const tenantUserIds = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .then(rows => rows.map(r => r.id));

    // 报销归属条件：直接归属该租户，或游离报销（tenantId=null）但提交人属于同租户
    const reimbTenantCondition = tenantUserIds.length > 0
      ? or(
          eq(reimbursements.tenantId, tenantId),
          and(isNull(reimbursements.tenantId), inArray(reimbursements.userId, tenantUserIds))
        )
      : eq(reimbursements.tenantId, tenantId);

    // 查询待付款（approved）的报销单数量和总额
    const pendingResult = await db.select({
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(total_amount_in_base_currency), 0)::float`,
    })
      .from(reimbursements)
      .where(and(
        reimbTenantCondition,
        eq(reimbursements.status, 'approved')
      ));

    // 查询已批准的预借款数量和总额
    const advancePendingResult = await db.select({
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(amount), 0)::float`,
    })
      .from(advances)
      .where(and(
        eq(advances.tenantId, tenantId),
        eq(advances.status, 'approved')
      ));

    const pendingCount = (pendingResult[0]?.count || 0) + (advancePendingResult[0]?.count || 0);
    const pendingTotal = (pendingResult[0]?.total || 0) + (advancePendingResult[0]?.total || 0);

    // 查询处理中的报销单数量
    const processingResult = await db.select({
      count: sql<number>`count(*)::int`,
    })
      .from(reimbursements)
      .where(and(reimbTenantCondition, eq(reimbursements.status, 'processing')));

    const processingCount = processingResult[0]?.count || 0;

    // 查询已付总数（报销单：paid + reversed）
    const totalPaidResult = await db.select({
      count: sql<number>`count(*)::int`,
    })
      .from(reimbursements)
      .where(and(
        reimbTenantCondition,
        inArray(reimbursements.status, ['paid', 'reversed'])
      ));

    // 已打款的预借款也计入"付款历史"（paid/reconciling/reconciled 都代表已完成打款）
    const advancePaidResult = await db.select({
      count: sql<number>`count(*)::int`,
    })
      .from(advances)
      .where(and(
        eq(advances.tenantId, tenantId),
        inArray(advances.status, ['paid', 'reconciling', 'reconciled'])
      ));

    const totalPaidCount =
      (totalPaidResult[0]?.count || 0) + (advancePaidResult[0]?.count || 0);

    // 查询今日已付的报销单数量
    const todayPaidReimbResult = await db.select({
      count: sql<number>`count(*)::int`,
    })
      .from(reimbursements)
      .where(and(
        reimbTenantCondition,
        eq(reimbursements.status, 'paid'),
        gte(reimbursements.paidAt, todayStart),
        lt(reimbursements.paidAt, todayEnd)
      ));

    // 今日已付的预借款数量
    const todayPaidAdvanceResult = await db.select({
      count: sql<number>`count(*)::int`,
    })
      .from(advances)
      .where(and(
        eq(advances.tenantId, tenantId),
        inArray(advances.status, ['paid', 'reconciling', 'reconciled']),
        gte(advances.paidAt, todayStart),
        lt(advances.paidAt, todayEnd)
      ));

    const todayPaidCount =
      (todayPaidReimbResult[0]?.count || 0) + (todayPaidAdvanceResult[0]?.count || 0);

    // 查询已冲销的报销单数量
    const reversedResult = await db.select({
      count: sql<number>`count(*)::int`,
    })
      .from(reimbursements)
      .where(and(reimbTenantCondition, eq(reimbursements.status, 'reversed')));

    const reversedCount = reversedResult[0]?.count || 0;

    return NextResponse.json({
      success: true,
      stats: {
        pendingCount,
        pendingTotal,
        processingCount,
        totalPaidCount,
        todayPaidCount,
        reversedCount,
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
