import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { payments, reimbursements } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { FluxaPayoutClient, PayoutStatus } from '@/lib/fluxa-payout';

export const dynamic = 'force-dynamic';

/**
 * Fluxa Payout Webhook 事件类型
 */
interface FluxaWebhookEvent {
  eventType: string;  // payout.authorized, payout.signed, payout.broadcasting, payout.succeeded, payout.failed, payout.expired
  payoutId: string;
  status: PayoutStatus;
  txHash?: string;
  toAddress: string;
  amount: string;
  currency: string;
  network: string;
  executedAt?: number;
  failureReason?: string;
  timestamp: number;
}

/**
 * POST /api/payments/fluxa-webhook
 * 处理 Fluxa Payout 的 Webhook 回调
 */
export async function POST(request: NextRequest) {
  try {
    const event: FluxaWebhookEvent = await request.json();

    console.log('Received Fluxa webhook event:', {
      eventType: event.eventType,
      payoutId: event.payoutId,
      status: event.status,
    });

    if (!event.payoutId) {
      return NextResponse.json({ error: 'Missing payoutId' }, { status: 400 });
    }

    // 查找对应的支付记录
    const [payment] = await db.select()
      .from(payments)
      .where(eq(payments.payoutId, event.payoutId))
      .limit(1);

    if (!payment) {
      console.warn('Payment not found for payoutId:', event.payoutId);
      // 返回 200 避免 webhook 重试
      return NextResponse.json({
        success: false,
        error: 'Payment not found',
        payoutId: event.payoutId,
      });
    }

    const newStatus = event.status;
    const previousStatus = payment.payoutStatus;

    // 更新支付记录
    const updateData: any = {
      payoutStatus: newStatus,
      updatedAt: new Date(),
    };

    if (event.txHash) {
      updateData.txHash = event.txHash;
    }

    // 根据状态更新
    if (FluxaPayoutClient.isSuccessStatus(newStatus)) {
      // 打款成功
      updateData.status = 'success';
      updateData.paidAt = event.executedAt
        ? new Date(event.executedAt * 1000)
        : new Date();

      // 更新报销单状态为已付款
      await db.update(reimbursements)
        .set({
          status: 'paid',
          paidAt: updateData.paidAt,
          updatedAt: new Date(),
        })
        .where(eq(reimbursements.id, payment.reimbursementId));

      console.log('Payout succeeded:', event.payoutId, 'txHash:', event.txHash);
    } else if (newStatus === 'failed') {
      // 打款失败
      updateData.status = 'failed';
      updateData.errorMessage = event.failureReason || '打款失败';

      // 报销单状态恢复为已批准，允许重试
      await db.update(reimbursements)
        .set({
          status: 'approved',
          updatedAt: new Date(),
        })
        .where(eq(reimbursements.id, payment.reimbursementId));

      console.log('Payout failed:', event.payoutId, 'reason:', event.failureReason);
    } else if (newStatus === 'expired') {
      // 打款已过期
      updateData.status = 'failed';
      updateData.errorMessage = '打款请求已过期';

      // 报销单状态恢复为已批准，允许重试
      await db.update(reimbursements)
        .set({
          status: 'approved',
          updatedAt: new Date(),
        })
        .where(eq(reimbursements.id, payment.reimbursementId));

      console.log('Payout expired:', event.payoutId);
    }

    // 更新支付记录
    await db.update(payments)
      .set(updateData)
      .where(eq(payments.id, payment.id));

    return NextResponse.json({
      success: true,
      payoutId: event.payoutId,
      previousStatus,
      newStatus,
      statusChanged: previousStatus !== newStatus,
      reimbursementId: payment.reimbursementId,
    });
  } catch (error) {
    console.error('Fluxa webhook error:', error);
    // 返回 200 避免过度重试
    return NextResponse.json({
      success: false,
      error: 'Webhook processing failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * GET /api/payments/fluxa-webhook
 * 用于 webhook 验证（如果 Fluxa 需要）
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get('challenge');

  if (challenge) {
    return NextResponse.json({ challenge });
  }

  return NextResponse.json({
    status: 'active',
    provider: 'fluxa',
    endpoint: '/api/payments/fluxa-webhook',
  });
}
