import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { reimbursements, payments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * FluxPay Webhook 处理器
 * 接收支付状态更新通知
 */

interface WebhookPayload {
  event: string;
  data: {
    transaction_id: string;
    status: string;
    amount: number;
    currency: string;
    reference_id: string;
    completed_at?: string;
    failed_reason?: string;
  };
  timestamp: number;
  signature: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-fluxpay-signature');

    // 验证签名
    if (!verifySignature(body, signature)) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    const payload: WebhookPayload = JSON.parse(body);

    // 处理不同的事件类型
    switch (payload.event) {
      case 'payment.completed':
        await handlePaymentCompleted(payload.data);
        break;

      case 'payment.failed':
        await handlePaymentFailed(payload.data);
        break;

      case 'payment.cancelled':
        await handlePaymentCancelled(payload.data);
        break;

      default:
        console.log('Unknown webhook event:', payload.event);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * 验证 Webhook 签名
 */
function verifySignature(body: string, signature: string | null): boolean {
  if (!signature) return false;

  const webhookSecret = process.env.FLUXPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.warn('FLUXPAY_WEBHOOK_SECRET not configured');
    return true; // 开发环境跳过验证
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * 处理付款完成事件
 */
async function handlePaymentCompleted(data: WebhookPayload['data']) {
  console.log('Payment completed:', data.transaction_id);

  const reimbursementId = data.reference_id;

  try {
    // 更新支付记录状态
    await db
      .update(payments)
      .set({
        status: 'success',
        paidAt: data.completed_at ? new Date(data.completed_at) : new Date(),
      })
      .where(eq(payments.transactionId, data.transaction_id));

    // 更新报销单状态为已付款
    await db
      .update(reimbursements)
      .set({
        status: 'paid',
        paidAt: data.completed_at ? new Date(data.completed_at) : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reimbursements.id, reimbursementId));

    console.log(`Reimbursement ${reimbursementId} marked as paid`);

    // TODO: 发送通知给申请人
    // await sendNotification(reimbursementId, 'payment_completed');
  } catch (error) {
    console.error('Failed to update payment status:', error);
    throw error;
  }
}

/**
 * 处理付款失败事件
 */
async function handlePaymentFailed(data: WebhookPayload['data']) {
  console.log('Payment failed:', data.transaction_id, data.failed_reason);

  const reimbursementId = data.reference_id;

  try {
    // 更新支付记录状态
    await db
      .update(payments)
      .set({
        status: 'failed',
        errorMessage: data.failed_reason || '支付失败',
      })
      .where(eq(payments.transactionId, data.transaction_id));

    // 将报销单状态改回已批准（可以重新发起支付）
    await db
      .update(reimbursements)
      .set({
        status: 'approved',
        updatedAt: new Date(),
      })
      .where(eq(reimbursements.id, reimbursementId));

    console.log(`Reimbursement ${reimbursementId} payment failed, status reverted to approved`);

    // TODO: 发送通知给财务和申请人
    // await sendNotification(reimbursementId, 'payment_failed');
  } catch (error) {
    console.error('Failed to handle payment failure:', error);
    throw error;
  }
}

/**
 * 处理付款取消事件
 */
async function handlePaymentCancelled(data: WebhookPayload['data']) {
  console.log('Payment cancelled:', data.transaction_id);

  const reimbursementId = data.reference_id;

  try {
    // 更新支付记录状态
    await db
      .update(payments)
      .set({
        status: 'cancelled',
      })
      .where(eq(payments.transactionId, data.transaction_id));

    // 将报销单状态改回已批准
    await db
      .update(reimbursements)
      .set({
        status: 'approved',
        updatedAt: new Date(),
      })
      .where(eq(reimbursements.id, reimbursementId));

    console.log(`Reimbursement ${reimbursementId} payment cancelled`);
  } catch (error) {
    console.error('Failed to handle payment cancellation:', error);
    throw error;
  }
}
