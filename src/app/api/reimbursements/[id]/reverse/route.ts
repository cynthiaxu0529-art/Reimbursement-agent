import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, reversals, payments, users } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getUserRoles } from '@/lib/auth/roles';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/reimbursements/[id]/reverse - 发起冲销
 * 将已付款的报销单冲销，金额转为员工应收
 * 仅限财务角色操作
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return apiError('未登录', 401);
    }

    // 权限检查：仅财务或超级管理员可冲销
    const [currentUser] = await db.select({ role: users.role, roles: users.roles })
      .from(users).where(eq(users.id, session.user.id)).limit(1);
    const roles = getUserRoles(currentUser || {});
    if (!roles.includes('finance') && !roles.includes('super_admin')) {
      return apiError('无权限执行冲销操作', 403);
    }

    const body = await request.json();
    const { reason, amount: reversalAmount, category = 'full', note } = body;

    if (!reason || reason.trim().length === 0) {
      return apiError('冲销原因不能为空', 400);
    }

    // 查询报销单
    const [reimbursement] = await db
      .select()
      .from(reimbursements)
      .where(eq(reimbursements.id, id));

    if (!reimbursement) {
      return apiError('报销单不存在', 404);
    }

    if (reimbursement.status !== 'paid') {
      return apiError('只有已付款的报销单可以冲销', 400);
    }

    // 确定冲销金额
    const paidAmount = reimbursement.totalAmountInBaseCurrency || reimbursement.totalAmount || 0;
    const finalAmount = reversalAmount && reversalAmount > 0 && reversalAmount <= paidAmount
      ? reversalAmount
      : paidAmount;

    const isPartial = finalAmount < paidAmount;
    const finalCategory = isPartial ? 'partial' : category;

    // 查询原支付记录
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.reimbursementId, id))
      .orderBy(desc(payments.createdAt))
      .limit(1);

    // 创建冲销记录
    const [reversal] = await db
      .insert(reversals)
      .values({
        tenantId: reimbursement.tenantId,
        reimbursementId: id,
        userId: reimbursement.userId,
        amount: finalAmount,
        currency: (reimbursement as any).baseCurrency || 'USD',
        reason: reason.trim(),
        category: finalCategory,
        receivableStatus: 'outstanding',
        repaidAmount: 0,
        initiatedBy: session.user.id,
        originalPaymentId: payment?.id || null,
        note: note || null,
      })
      .returning();

    // 更新报销单状态为 reversed
    await db
      .update(reimbursements)
      .set({
        status: 'reversed',
        updatedAt: new Date(),
      })
      .where(eq(reimbursements.id, id));

    // 查询员工信息
    const [employee] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, reimbursement.userId));

    return NextResponse.json({
      success: true,
      data: {
        reversal: {
          id: reversal.id,
          amount: finalAmount,
          currency: reversal.currency,
          reason: reversal.reason,
          category: finalCategory,
          receivableStatus: 'outstanding',
          isPartial,
          employee: employee || null,
        },
      },
      message: `冲销成功，${isPartial ? '部分' : '全额'}冲销 $${finalAmount.toFixed(2)}，已转为员工应收`,
    });
  } catch (error) {
    console.error('Reversal error:', error);
    return apiError('冲销处理失败', 500);
  }
}
