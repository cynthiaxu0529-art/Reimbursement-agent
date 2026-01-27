import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { payments, reimbursements } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  createFluxaPayoutService,
  FluxaPayoutClient,
} from '@/lib/fluxa-payout';

export const dynamic = 'force-dynamic';

/**
 * GET /api/payments/status/[payoutId]
 * 查询 Fluxa Payout 状态
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ payoutId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { payoutId } = await params;

    if (!payoutId) {
      return NextResponse.json({ error: '缺少 payoutId' }, { status: 400 });
    }

    // 查找本地支付记录
    const [payment] = await db.select()
      .from(payments)
      .where(eq(payments.payoutId, payoutId))
      .limit(1);

    if (!payment) {
      return NextResponse.json({ error: '支付记录不存在' }, { status: 404 });
    }

    // 获取关联的报销单，验证租户权限
    const [reimbursement] = await db.select()
      .from(reimbursements)
      .where(and(
        eq(reimbursements.id, payment.reimbursementId),
        eq(reimbursements.tenantId, session.user.tenantId)
      ))
      .limit(1);

    if (!reimbursement) {
      return NextResponse.json({ error: '无权访问此支付记录' }, { status: 403 });
    }

    // 从 Fluxa API 获取最新状态
    const payoutService = createFluxaPayoutService();
    const result = await payoutService.checkPayoutStatus(payoutId);

    if (result.success && result.payout) {
      const payout = result.payout;
      const previousStatus = payment.payoutStatus;
      const newStatus = payout.status;

      // 如果状态有变化，更新本地记录
      if (previousStatus !== newStatus) {
        const updateData: any = {
          payoutStatus: newStatus,
          txHash: payout.txHash,
          updatedAt: new Date(),
        };

        // 如果打款成功，更新状态
        if (FluxaPayoutClient.isSuccessStatus(newStatus)) {
          updateData.status = 'success';
          updateData.paidAt = payout.executedAt
            ? new Date(payout.executedAt * 1000)
            : new Date();

          // 同时更新报销单状态
          await db.update(reimbursements)
            .set({
              status: 'paid',
              paidAt: updateData.paidAt,
              updatedAt: new Date(),
            })
            .where(eq(reimbursements.id, payment.reimbursementId));
        }

        // 如果打款失败或过期
        if (newStatus === 'failed' || newStatus === 'expired') {
          updateData.status = 'failed';
          updateData.errorMessage = newStatus === 'expired'
            ? '打款请求已过期，请重新发起'
            : '打款失败';

          // 报销单状态恢复为已批准，允许重试
          await db.update(reimbursements)
            .set({
              status: 'approved',
              updatedAt: new Date(),
            })
            .where(eq(reimbursements.id, payment.reimbursementId));
        }

        await db.update(payments)
          .set(updateData)
          .where(eq(payments.id, payment.id));
      }

      return NextResponse.json({
        success: true,
        payoutId: payout.payoutId,
        status: newStatus,
        statusDescription: FluxaPayoutClient.getStatusDescription(newStatus),
        previousStatus,
        statusChanged: previousStatus !== newStatus,
        txHash: payout.txHash,
        approvalUrl: payout.approvalUrl,
        toAddress: payout.toAddress,
        amount: payout.amount,
        amountUSDC: FluxaPayoutClient.usdcUnitsToUsd(payout.amount),
        currency: payout.currency,
        network: payout.network,
        createdAt: payout.createdAt ? new Date(payout.createdAt * 1000).toISOString() : null,
        executedAt: payout.executedAt ? new Date(payout.executedAt * 1000).toISOString() : null,
        expiresAt: payout.expiresAt ? new Date(payout.expiresAt * 1000).toISOString() : null,
        isTerminal: FluxaPayoutClient.isTerminalStatus(newStatus),
        isSuccess: FluxaPayoutClient.isSuccessStatus(newStatus),
        reimbursementId: payment.reimbursementId,
      });
    } else {
      // Fluxa API 查询失败，返回本地缓存的状态
      return NextResponse.json({
        success: true,
        payoutId: payment.payoutId,
        status: payment.payoutStatus,
        statusDescription: payment.payoutStatus
          ? FluxaPayoutClient.getStatusDescription(payment.payoutStatus as any)
          : '未知',
        txHash: payment.txHash,
        approvalUrl: payment.approvalUrl,
        toAddress: payment.toAddress,
        amountUSDC: payment.amount,
        currency: payment.currency,
        createdAt: payment.createdAt?.toISOString(),
        paidAt: payment.paidAt?.toISOString(),
        expiresAt: payment.expiresAt?.toISOString(),
        reimbursementId: payment.reimbursementId,
        apiError: result.error?.message,
        cached: true,
      });
    }
  } catch (error) {
    console.error('Get payout status error:', error);
    return NextResponse.json({
      success: false,
      error: '查询状态失败',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
