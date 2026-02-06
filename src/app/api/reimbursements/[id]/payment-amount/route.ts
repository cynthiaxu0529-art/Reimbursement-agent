import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/reimbursements/[id]/payment-amount
 * 财务设置自定义打款金额
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;

    // 权限检查：只有财务/管理员可修改打款金额
    const [currentUser] = await db.select({ role: users.role, roles: users.roles })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const userRoles = getUserRoles(currentUser || {});
    if (!canProcessPayment(userRoles)) {
      return NextResponse.json({ error: '没有权限修改打款金额' }, { status: 403 });
    }

    const body = await request.json();
    const { customPaymentAmount } = body;

    // 获取报销单
    const [reimbursement] = await db.select()
      .from(reimbursements)
      .where(and(
        eq(reimbursements.id, id),
        eq(reimbursements.tenantId, session.user.tenantId)
      ))
      .limit(1);

    if (!reimbursement) {
      return NextResponse.json({ error: '报销单不存在' }, { status: 404 });
    }

    // 只有已批准状态的报销单可以修改打款金额
    if (reimbursement.status !== 'approved') {
      return NextResponse.json({
        error: '只有已批准的报销单可以修改打款金额',
      }, { status: 400 });
    }

    const originalAmount = reimbursement.totalAmountInBaseCurrency ||
      Number(reimbursement.totalAmount) * 0.14;

    // 验证金额
    if (customPaymentAmount !== null && customPaymentAmount !== undefined) {
      const amount = parseFloat(customPaymentAmount);
      if (isNaN(amount) || amount <= 0) {
        return NextResponse.json({
          error: '打款金额必须大于0',
        }, { status: 400 });
      }
      if (amount > originalAmount) {
        return NextResponse.json({
          error: `打款金额不能超过报销金额 $${originalAmount.toFixed(2)}`,
        }, { status: 400 });
      }
    }

    // 更新 aiSuggestions 中的自定义打款金额
    const existingSuggestions = (reimbursement.aiSuggestions as any[]) || [];

    // 移除旧的自定义金额记录
    const filteredSuggestions = existingSuggestions.filter(
      (s: any) => s.type !== 'custom_payment_amount'
    );

    // 添加新的自定义金额记录（如果有值）
    if (customPaymentAmount !== null && customPaymentAmount !== undefined) {
      filteredSuggestions.push({
        type: 'custom_payment_amount',
        amount: parseFloat(customPaymentAmount),
        currency: 'USD',
        setAt: new Date().toISOString(),
        setBy: session.user.id,
        originalAmount,
      });
    }

    // 更新报销单
    await db.update(reimbursements)
      .set({
        aiSuggestions: filteredSuggestions,
        updatedAt: new Date(),
      })
      .where(eq(reimbursements.id, id));

    return NextResponse.json({
      success: true,
      customPaymentAmount: customPaymentAmount ? parseFloat(customPaymentAmount) : null,
      originalAmount,
      message: customPaymentAmount
        ? `打款金额已设置为 $${parseFloat(customPaymentAmount).toFixed(2)}`
        : '已重置为原报销金额',
    });
  } catch (error) {
    console.error('Update payment amount error:', error);
    return NextResponse.json({
      error: '更新打款金额失败',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/reimbursements/[id]/payment-amount
 * 重置自定义打款金额
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

    const { id } = await params;

    // 权限检查
    const [currentUser] = await db.select({ role: users.role, roles: users.roles })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const userRoles = getUserRoles(currentUser || {});
    if (!canProcessPayment(userRoles)) {
      return NextResponse.json({ error: '没有权限修改打款金额' }, { status: 403 });
    }

    // 获取报销单
    const [reimbursement] = await db.select()
      .from(reimbursements)
      .where(and(
        eq(reimbursements.id, id),
        eq(reimbursements.tenantId, session.user.tenantId)
      ))
      .limit(1);

    if (!reimbursement) {
      return NextResponse.json({ error: '报销单不存在' }, { status: 404 });
    }

    // 移除自定义金额记录
    const existingSuggestions = (reimbursement.aiSuggestions as any[]) || [];
    const filteredSuggestions = existingSuggestions.filter(
      (s: any) => s.type !== 'custom_payment_amount'
    );

    await db.update(reimbursements)
      .set({
        aiSuggestions: filteredSuggestions,
        updatedAt: new Date(),
      })
      .where(eq(reimbursements.id, id));

    return NextResponse.json({
      success: true,
      message: '已重置为原报销金额',
    });
  } catch (error) {
    console.error('Reset payment amount error:', error);
    return NextResponse.json({
      error: '重置打款金额失败',
    }, { status: 500 });
  }
}
