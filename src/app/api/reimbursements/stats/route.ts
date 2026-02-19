import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, users, tenants } from '@/lib/db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { getUserRoles, canApprove, canProcessPayment, isAdmin } from '@/lib/auth/roles';
import { getVisibleUserIds } from '@/lib/department/department-service';
import {
  PENDING_STATUSES,
  APPROVED_STATUSES,
  PROCESSING_STATUSES,
  PAID_STATUSES,
  REJECTED_STATUSES,
} from '@/lib/constants/reimbursement';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reimbursements/stats
 * 服务端聚合统计，避免前端 pageSize 截断导致统计不准确
 *
 * Query params:
 * - role: 'employee' | 'approver' | 'admin'
 *   - employee: 返回当前用户个人统计
 *   - approver: 返回审批人视角待审批统计
 *   - admin: 返回全公司统计
 *
 * Returns:
 * {
 *   success: true,
 *   stats: {
 *     baseCurrency: string,        // 租户本位币
 *     // 个人统计 (role=employee 或始终返回)
 *     myTotal: number,
 *     myPending: number,
 *     myApproved: number,
 *     myProcessing: number,
 *     myPaid: number,
 *     myRejected: number,
 *     myTotalAmount: number,       // 本位币累计金额（仅活跃状态）
 *     // 审批统计 (role=approver)
 *     pendingApproval: number,
 *     pendingApprovalAmount: number,
 *     // 全公司统计 (role=admin)
 *     companyTotal: number,
 *     companyPending: number,
 *     companyApproved: number,
 *     companyProcessing: number,
 *     companyPaid: number,
 *     companyTotalAmount: number,
 *     teamMembers: number,
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!currentUser) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role') || 'employee';

    // 获取租户本位币
    let baseCurrency = 'USD';
    if (currentUser.tenantId) {
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, currentUser.tenantId),
        columns: { baseCurrency: true },
      });
      if (tenant?.baseCurrency) {
        baseCurrency = tenant.baseCurrency;
      }
    }

    const stats: Record<string, any> = { baseCurrency };

    // ============================================================================
    // 个人统计（始终返回）
    // ============================================================================
    const myCondition = eq(reimbursements.userId, session.user.id);

    const myStatsResult = await db.select({
      status: reimbursements.status,
      count: sql<number>`count(*)::int`,
      totalAmount: sql<number>`coalesce(sum(${reimbursements.totalAmountInBaseCurrency}), 0)::real`,
    })
      .from(reimbursements)
      .where(myCondition)
      .groupBy(reimbursements.status);

    let myTotal = 0;
    let myPending = 0;
    let myApproved = 0;
    let myProcessing = 0;
    let myPaid = 0;
    let myRejected = 0;
    let myTotalAmount = 0;

    for (const row of myStatsResult) {
      const count = row.count;
      const amount = row.totalAmount;
      myTotal += count;

      if ((PENDING_STATUSES as readonly string[]).includes(row.status)) {
        myPending += count;
        myTotalAmount += amount;
      } else if ((APPROVED_STATUSES as readonly string[]).includes(row.status)) {
        myApproved += count;
        myTotalAmount += amount;
      } else if ((PROCESSING_STATUSES as readonly string[]).includes(row.status)) {
        myProcessing += count;
        myTotalAmount += amount;
      } else if ((PAID_STATUSES as readonly string[]).includes(row.status)) {
        myPaid += count;
        myTotalAmount += amount;
      } else if ((REJECTED_STATUSES as readonly string[]).includes(row.status)) {
        myRejected += count;
        myTotalAmount += amount;
      }
      // draft 和 cancelled 不计入 myTotalAmount
    }

    stats.myTotal = myTotal;
    stats.myPending = myPending;
    stats.myApproved = myApproved;
    stats.myProcessing = myProcessing;
    stats.myPaid = myPaid;
    stats.myRejected = myRejected;
    stats.myTotalAmount = Math.round(myTotalAmount * 100) / 100;

    // ============================================================================
    // 审批人统计
    // ============================================================================
    if (role === 'approver' || role === 'admin') {
      const userRoles = getUserRoles(currentUser);
      if ((canApprove(userRoles) || isAdmin(userRoles)) && currentUser.tenantId) {
        const visibleUserIds = await getVisibleUserIds(
          session.user.id,
          currentUser.tenantId,
          userRoles
        );

        const approverConditions: any[] = [
          eq(reimbursements.tenantId, currentUser.tenantId),
          inArray(reimbursements.status, [...PENDING_STATUSES] as any[]),
        ];

        if (visibleUserIds !== null && visibleUserIds.length > 0) {
          approverConditions.push(inArray(reimbursements.userId, visibleUserIds));
        } else if (visibleUserIds !== null) {
          // No visible users, can only see own
          approverConditions.push(eq(reimbursements.userId, session.user.id));
        }
        // visibleUserIds === null means finance/admin can see all

        const pendingResult = await db.select({
          count: sql<number>`count(*)::int`,
          totalAmount: sql<number>`coalesce(sum(${reimbursements.totalAmountInBaseCurrency}), 0)::real`,
        })
          .from(reimbursements)
          .where(and(...approverConditions));

        stats.pendingApproval = pendingResult[0]?.count || 0;
        stats.pendingApprovalAmount = Math.round((pendingResult[0]?.totalAmount || 0) * 100) / 100;
      } else {
        stats.pendingApproval = 0;
        stats.pendingApprovalAmount = 0;
      }
    }

    // ============================================================================
    // 管理员统计（全公司）
    // ============================================================================
    if (role === 'admin' && currentUser.tenantId) {
      const userRoles = getUserRoles(currentUser);
      if (isAdmin(userRoles)) {
        // 全公司报销统计
        const companyCondition = eq(reimbursements.tenantId, currentUser.tenantId);

        const companyStatsResult = await db.select({
          status: reimbursements.status,
          count: sql<number>`count(*)::int`,
          totalAmount: sql<number>`coalesce(sum(${reimbursements.totalAmountInBaseCurrency}), 0)::real`,
        })
          .from(reimbursements)
          .where(companyCondition)
          .groupBy(reimbursements.status);

        let companyTotal = 0;
        let companyPending = 0;
        let companyApproved = 0;
        let companyProcessing = 0;
        let companyPaid = 0;
        let companyTotalAmount = 0;

        for (const row of companyStatsResult) {
          const count = row.count;
          const amount = row.totalAmount;
          companyTotal += count;

          if ((PENDING_STATUSES as readonly string[]).includes(row.status)) {
            companyPending += count;
            companyTotalAmount += amount;
          } else if ((APPROVED_STATUSES as readonly string[]).includes(row.status)) {
            companyApproved += count;
            companyTotalAmount += amount;
          } else if ((PROCESSING_STATUSES as readonly string[]).includes(row.status)) {
            companyProcessing += count;
            companyTotalAmount += amount;
          } else if ((PAID_STATUSES as readonly string[]).includes(row.status)) {
            companyPaid += count;
            companyTotalAmount += amount;
          }
          // draft, cancelled, rejected 不计入 companyTotalAmount
        }

        stats.companyTotal = companyTotal;
        stats.companyPending = companyPending;
        stats.companyApproved = companyApproved;
        stats.companyProcessing = companyProcessing;
        stats.companyPaid = companyPaid;
        stats.companyTotalAmount = Math.round(companyTotalAmount * 100) / 100;

        // 团队成员数
        const teamResult = await db.select({
          count: sql<number>`count(*)::int`,
        })
          .from(users)
          .where(eq(users.tenantId, currentUser.tenantId));

        stats.teamMembers = teamResult[0]?.count || 0;
      }
    }

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('Get reimbursement stats error:', error);
    return NextResponse.json(
      { error: '获取统计数据失败' },
      { status: 500 }
    );
  }
}
