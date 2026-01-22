import { NextRequest, NextResponse } from 'next/server';
import { createPaymentService } from '@/lib/mcp/fluxpay-client';

export const dynamic = 'force-dynamic';

/**
 * 创建付款
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      reimbursementId,
      userId,
      amount,
      currency,
      recipient,
      description,
    } = body;

    // 验证必要参数
    if (!reimbursementId || !userId || !amount || !currency || !recipient) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const paymentService = createPaymentService();
    const result = await paymentService.processReimbursementPayment(
      reimbursementId,
      userId,
      amount,
      currency,
      recipient,
      description
    );

    if (result.success) {
      return NextResponse.json({
        success: true,
        transactionId: result.transactionId,
        status: result.status,
        message: result.message,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Payment error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Payment failed',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * 查询付款状态
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('transactionId');

    if (!transactionId) {
      return NextResponse.json(
        { error: 'Transaction ID is required' },
        { status: 400 }
      );
    }

    const paymentService = createPaymentService();
    const status = await paymentService.checkPaymentStatus(transactionId);

    if (status) {
      return NextResponse.json({
        success: true,
        transactionId,
        status,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Transaction not found',
        },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Query payment error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Query failed',
      },
      { status: 500 }
    );
  }
}
