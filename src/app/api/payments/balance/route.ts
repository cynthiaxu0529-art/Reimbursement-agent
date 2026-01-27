import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { FluxPayClient } from '@/lib/mcp/fluxpay-client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/payments/balance
 * 获取 FluxPay 钱包可用余额
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const client = new FluxPayClient();
    const result = await client.getBalance();

    if (result.success) {
      return NextResponse.json({
        success: true,
        balance: result.balance,
        currency: result.currency,
      });
    } else {
      // 如果 FluxPay API 调用失败，返回一个模拟值用于演示
      // 生产环境应该返回错误
      const isDev = process.env.NODE_ENV === 'development' || !process.env.FLUXPAY_API_KEY;

      if (isDev) {
        return NextResponse.json({
          success: true,
          balance: 0, // 未配置时显示 0
          currency: 'USD',
          warning: 'FluxPay 未配置，显示为 0',
        });
      }

      return NextResponse.json({
        success: false,
        error: result.error || '获取余额失败',
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Get balance error:', error);
    return NextResponse.json({
      success: false,
      error: '获取余额失败',
    }, { status: 500 });
  }
}
