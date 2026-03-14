import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { advances, advanceReconciliations, users } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

/**
 * GET /api/advances/summary - 预借款汇总数据（供 accounting agent 调用）
 * 返回按状态分组的汇总、待核销余额等
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '未关联公司' }, { status: 404 });
    }

    // 获取所有预借款
    const allAdvances = await db.query.advances.findMany({
      where: eq(advances.tenantId, user.tenantId),
      with: {
        user: true,
        reconciliations: {
          with: {
            reimbursement: true,
          },
        },
      },
    });

    // 按状态分组汇总
    const statusSummary: Record<string, { count: number; totalAmount: number }> = {};
    let totalAdvanced = 0;
    let totalReconciled = 0;
    let totalPending = 0;

    const advanceDetails = allAdvances.map(a => {
      const reconciledAmount = (a.reconciliations || []).reduce(
        (sum: number, r: any) => sum + r.amount, 0
      );
      const remaining = a.amount - reconciledAmount;

      if (!statusSummary[a.status]) {
        statusSummary[a.status] = { count: 0, totalAmount: 0 };
      }
      statusSummary[a.status].count++;
      statusSummary[a.status].totalAmount += a.amount;

      if (['approved', 'paid', 'reconciling'].includes(a.status)) {
        totalAdvanced += a.amount;
        totalReconciled += reconciledAmount;
      }
      if (a.status === 'pending') {
        totalPending += a.amount;
      }

      return {
        id: a.id,
        userId: a.userId,
        userName: a.user?.name,
        title: a.title,
        amount: a.amount,
        currency: a.currency,
        status: a.status,
        reconciledAmount,
        remainingAmount: remaining,
        reconciliations: (a.reconciliations || []).map((r: any) => ({
          reimbursementId: r.reimbursementId,
          reimbursementTitle: r.reimbursement?.title,
          amount: r.amount,
          createdAt: r.createdAt,
        })),
        createdAt: a.createdAt,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalAdvanced,
          totalReconciled,
          outstandingBalance: totalAdvanced - totalReconciled,
          totalPending,
          byStatus: statusSummary,
        },
        advances: advanceDetails,
      },
    });
  } catch (error) {
    console.error('Get advance summary error:', error);
    return NextResponse.json({ error: '获取预借款汇总失败' }, { status: 500 });
  }
}
