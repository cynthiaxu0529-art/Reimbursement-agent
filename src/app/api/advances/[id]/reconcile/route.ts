import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { advances, advanceReconciliations, reimbursements, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

/**
 * POST /api/advances/:id/reconcile - 核销预借款（关联报销单）
 * 财务将报销单与预借款关联，进行核销
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 财务/管理员或申请人本人可以核销
    const isFinanceOrAdmin = user.role === 'admin' || user.role === 'super_admin' || user.role === 'finance';

    const { id } = await params;
    const body = await request.json();
    const { reimbursementId, amount, note } = body;

    if (!reimbursementId || !amount || amount <= 0) {
      return NextResponse.json({ error: '请提供报销单ID和核销金额' }, { status: 400 });
    }

    // 获取预借款
    const advance = await db.query.advances.findFirst({
      where: eq(advances.id, id),
      with: {
        reconciliations: true,
      },
    });

    if (!advance) {
      return NextResponse.json({ error: '预借款不存在' }, { status: 404 });
    }

    // 只有申请人或财务可以核销
    if (!isFinanceOrAdmin && advance.userId !== user.id) {
      return NextResponse.json({ error: '无权核销此预借款' }, { status: 403 });
    }

    if (!['approved', 'paid', 'reconciling'].includes(advance.status)) {
      return NextResponse.json({ error: '预借款状态不允许核销' }, { status: 400 });
    }

    // 获取报销单
    const reimbursement = await db.query.reimbursements.findFirst({
      where: eq(reimbursements.id, reimbursementId),
    });

    if (!reimbursement) {
      return NextResponse.json({ error: '报销单不存在' }, { status: 404 });
    }

    // 检查核销金额不超过预借款余额
    const totalReconciled = (advance.reconciliations || []).reduce(
      (sum: number, r: any) => sum + r.amount, 0
    );
    const remaining = advance.amount - totalReconciled;

    if (amount > remaining) {
      return NextResponse.json({
        error: `核销金额超出预借款余额，剩余可核销: $${remaining.toFixed(2)}`,
      }, { status: 400 });
    }

    // 创建核销记录
    const reconciliation = await db.insert(advanceReconciliations).values({
      id: uuid(),
      advanceId: id,
      reimbursementId,
      amount,
      note: note || '',
      createdBy: user.id,
    }).returning();

    // 更新预借款状态
    const newTotalReconciled = totalReconciled + amount;
    const isFullyReconciled = Math.abs(newTotalReconciled - advance.amount) < 0.01;

    await db.update(advances)
      .set({
        reconciledAmount: newTotalReconciled,
        status: isFullyReconciled ? 'reconciled' : 'reconciling',
        ...(isFullyReconciled && { reconciledAt: new Date() }),
        updatedAt: new Date(),
      })
      .where(eq(advances.id, id));

    return NextResponse.json({
      success: true,
      data: reconciliation[0],
      remaining: advance.amount - newTotalReconciled,
      isFullyReconciled,
    });
  } catch (error) {
    console.error('Reconcile advance error:', error);
    return NextResponse.json({ error: '核销预借款失败' }, { status: 500 });
  }
}
