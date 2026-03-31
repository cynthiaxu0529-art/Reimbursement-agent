import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reversals, reimbursements, users } from '@/lib/db/schema';
import { eq, and, ne, desc, sql } from 'drizzle-orm';
import { getUserRoles } from '@/lib/auth/roles';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * GET /api/receivables - 获取员工应收列表（冲销产生的应收）
 * 财务可查看所有，员工只能查看自己的
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return apiError('未登录', 401);
    }

    const [currentUser] = await db.select({ role: users.role, roles: users.roles })
      .from(users).where(eq(users.id, session.user.id)).limit(1);
    const roles = getUserRoles(currentUser || {});
    const isFinance = roles.includes('finance') || roles.includes('super_admin');

    const url = new URL(request.url);
    const status = url.searchParams.get('status'); // outstanding, repaid, waived, all

    // 构建查询
    const conditions = [];

    if (!isFinance) {
      // 普通员工只能看自己的
      conditions.push(eq(reversals.userId, session.user.id));
    }

    if (status && status !== 'all') {
      conditions.push(eq(reversals.receivableStatus, status));
    }

    const results = await db
      .select({
        id: reversals.id,
        amount: reversals.amount,
        currency: reversals.currency,
        reason: reversals.reason,
        category: reversals.category,
        receivableStatus: reversals.receivableStatus,
        repaidAmount: reversals.repaidAmount,
        repaidAt: reversals.repaidAt,
        waivedAt: reversals.waivedAt,
        waivedReason: reversals.waivedReason,
        note: reversals.note,
        createdAt: reversals.createdAt,
        reimbursementId: reversals.reimbursementId,
        reimbursementTitle: reimbursements.title,
        employeeId: reversals.userId,
        employeeName: users.name,
        employeeEmail: users.email,
      })
      .from(reversals)
      .innerJoin(reimbursements, eq(reversals.reimbursementId, reimbursements.id))
      .innerJoin(users, eq(reversals.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(reversals.createdAt));

    // 统计汇总
    const totalOutstanding = results
      .filter((r: { receivableStatus: string }) => r.receivableStatus === 'outstanding' || r.receivableStatus === 'partially_repaid')
      .reduce((sum: number, r: { amount: number; repaidAmount: number }) => sum + (r.amount - r.repaidAmount), 0);

    const totalCount = results.length;
    const outstandingCount = results.filter((r: { receivableStatus: string }) =>
      r.receivableStatus === 'outstanding' || r.receivableStatus === 'partially_repaid'
    ).length;

    return NextResponse.json({
      success: true,
      data: results,
      stats: {
        totalCount,
        outstandingCount,
        totalOutstanding,
      },
    });
  } catch (error) {
    console.error('Receivables list error:', error);
    return apiError('获取应收列表失败', 500);
  }
}

/**
 * PATCH /api/receivables - 更新应收状态（还款/豁免）
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return apiError('未登录', 401);
    }

    const [patchUser] = await db.select({ role: users.role, roles: users.roles })
      .from(users).where(eq(users.id, session.user.id)).limit(1);
    const roles = getUserRoles(patchUser || {});
    if (!roles.includes('finance') && !roles.includes('super_admin')) {
      return apiError('无权限', 403);
    }

    const body = await request.json();
    const { reversalId, action, amount, reason } = body;

    if (!reversalId) {
      return apiError('缺少冲销记录ID', 400);
    }

    const [reversal] = await db
      .select()
      .from(reversals)
      .where(eq(reversals.id, reversalId));

    if (!reversal) {
      return apiError('冲销记录不存在', 404);
    }

    if (action === 'repay') {
      // 还款
      const repayAmount = amount || (reversal.amount - reversal.repaidAmount);
      const newRepaid = reversal.repaidAmount + repayAmount;
      const isFullyRepaid = newRepaid >= reversal.amount;

      await db
        .update(reversals)
        .set({
          repaidAmount: newRepaid,
          receivableStatus: isFullyRepaid ? 'repaid' : 'partially_repaid',
          repaidAt: isFullyRepaid ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(reversals.id, reversalId));

      return NextResponse.json({
        success: true,
        message: isFullyRepaid
          ? `已全额还款 $${reversal.amount.toFixed(2)}`
          : `已还款 $${repayAmount.toFixed(2)}，剩余 $${(reversal.amount - newRepaid).toFixed(2)}`,
      });
    } else if (action === 'waive') {
      // 豁免
      if (!reason) {
        return apiError('豁免原因不能为空', 400);
      }

      await db
        .update(reversals)
        .set({
          receivableStatus: 'waived',
          waivedAt: new Date(),
          waivedBy: session.user.id,
          waivedReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(reversals.id, reversalId));

      return NextResponse.json({
        success: true,
        message: '已豁免该应收',
      });
    } else {
      return apiError('无效的操作类型，支持: repay, waive', 400);
    }
  } catch (error) {
    console.error('Receivable update error:', error);
    return apiError('更新应收状态失败', 500);
  }
}
