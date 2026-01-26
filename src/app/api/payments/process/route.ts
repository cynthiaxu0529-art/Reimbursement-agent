import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createPaymentService } from '@/lib/mcp/fluxpay-client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payments/process
 * 财务处理付款 - 通过 FluxPay 发起打款
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { reimbursementId } = await request.json();

    if (!reimbursementId) {
      return NextResponse.json({ error: '缺少报销单ID' }, { status: 400 });
    }

    // 获取报销单
    const [reimbursement] = await db.select()
      .from(reimbursements)
      .where(and(
        eq(reimbursements.id, reimbursementId),
        eq(reimbursements.tenantId, session.user.tenantId)
      ))
      .limit(1);

    if (!reimbursement) {
      return NextResponse.json({ error: '报销单不存在' }, { status: 404 });
    }

    if (reimbursement.status !== 'approved') {
      return NextResponse.json({ error: '只有已批准的报销单可以付款' }, { status: 400 });
    }

    // 获取报销人信息
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, reimbursement.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: '找不到报销人信息' }, { status: 404 });
    }

    // 获取钱包地址
    const walletInfo = user.bankAccount as { walletAddress?: string; chain?: string; } | null;

    if (!walletInfo?.walletAddress) {
      return NextResponse.json({
        success: false,
        error: '用户未配置钱包地址',
        message: '请联系员工在个人设置中添加 Base 链钱包地址',
      }, { status: 400 });
    }

    // 计算付款金额（使用美元）
    const amountUSD = reimbursement.totalAmountInBaseCurrency ||
      Number(reimbursement.totalAmount) * 0.14;

    // 调用 FluxPay 处理付款
    const paymentService = createPaymentService();
    const result = await paymentService.processReimbursementPayment(
      reimbursement.id,
      user.id,
      amountUSD,
      'USD',
      {
        name: user.name || 'User',
        walletAddress: walletInfo.walletAddress,
        chain: walletInfo.chain || 'base',
      },
      `报销付款 - ${reimbursement.title}`
    );

    if (result.success) {
      // 更新报销单状态为处理中
      await db.update(reimbursements)
        .set({
          status: 'processing',
          updatedAt: new Date(),
          // 存储支付信息到 aiSuggestions 字段（临时方案）
          aiSuggestions: [
            ...(reimbursement.aiSuggestions as any[] || []),
            {
              type: 'payment_initiated',
              paymentId: result.transactionId,
              initiatedAt: new Date().toISOString(),
              initiatedBy: session.user.id,
            },
          ],
        })
        .where(eq(reimbursements.id, reimbursementId));

      return NextResponse.json({
        success: true,
        transactionId: result.transactionId,
        status: result.status,
        message: '付款已发起，正在通过 FluxPay 处理',
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
        message: result.message || '付款处理失败',
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Process payment error:', error);
    return NextResponse.json({
      success: false,
      error: '付款处理失败',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
