import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

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

  // TODO: 更新报销单状态为已付款
  // await updateReimbursementStatus(data.reference_id, 'paid', {
  //   transactionId: data.transaction_id,
  //   paidAt: data.completed_at,
  // });

  // TODO: 发送通知给申请人
  // await sendNotification(data.reference_id, 'payment_completed');
}

/**
 * 处理付款失败事件
 */
async function handlePaymentFailed(data: WebhookPayload['data']) {
  console.log('Payment failed:', data.transaction_id, data.failed_reason);

  // TODO: 更新报销单状态
  // await updateReimbursementStatus(data.reference_id, 'payment_failed', {
  //   transactionId: data.transaction_id,
  //   failedReason: data.failed_reason,
  // });

  // TODO: 发送通知给财务和申请人
  // await sendNotification(data.reference_id, 'payment_failed');
}

/**
 * 处理付款取消事件
 */
async function handlePaymentCancelled(data: WebhookPayload['data']) {
  console.log('Payment cancelled:', data.transaction_id);

  // TODO: 更新报销单状态
  // await updateReimbursementStatus(data.reference_id, 'approved', {
  //   transactionId: null,
  // });
}
