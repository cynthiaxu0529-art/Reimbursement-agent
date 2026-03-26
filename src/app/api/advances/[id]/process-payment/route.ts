import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { advances, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  createFluxaPayoutService,
  FluxaPayoutClient,
} from '@/lib/fluxa-payout';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/**
 * POST /api/advances/:id/process-payment
 * 财务对已批准的预借款发起 Fluxa 打款
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 权限检查
    const [currentUser] = await db.select({ role: users.role, roles: users.roles })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const userRoles = getUserRoles(currentUser || {});
    if (!canProcessPayment(userRoles)) {
      return NextResponse.json({ error: '没有权限发起付款，需要财务或管理员角色' }, { status: 403 });
    }

    const { id } = await params;

    // 获取预借款
    const advance = await db.query.advances.findFirst({
      where: eq(advances.id, id),
    });

    if (!advance) {
      return NextResponse.json({ error: '预借款不存在' }, { status: 404 });
    }

    if (advance.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: '无权操作此预借款' }, { status: 403 });
    }

    if (advance.status !== 'approved') {
      return NextResponse.json({
        success: false,
        error: advance.status === 'paid'
          ? '该预借款已完成付款'
          : '只有已批准的预借款可以付款',
      }, { status: 400 });
    }

    // 获取申请人信息
    const [advanceUser] = await db.select()
      .from(users)
      .where(eq(users.id, advance.userId))
      .limit(1);

    if (!advanceUser) {
      return NextResponse.json({ error: '找不到申请人信息' }, { status: 404 });
    }

    // 获取钱包地址
    const walletInfo = advanceUser.bankAccount as { walletAddress?: string; chain?: string } | null;

    if (!walletInfo?.walletAddress) {
      return NextResponse.json({
        success: false,
        error: '用户未配置钱包地址',
        message: '请联系员工在个人设置中添加 Base 链钱包地址',
      }, { status: 400 });
    }

    // 验证钱包地址格式
    const evmAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!evmAddressRegex.test(walletInfo.walletAddress)) {
      return NextResponse.json({
        success: false,
        error: '钱包地址格式无效',
        message: '需要有效的 Base 链钱包地址 (0x开头的40位十六进制)',
      }, { status: 400 });
    }

    const amountUSD = advance.amount;

    // 初始化 Fluxa Payout 服务
    const payoutService = createFluxaPayoutService();

    if (!payoutService.isConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'Fluxa 钱包未配置',
        message: '请在环境变量中配置 FLUXA_AGENT_ID 和 FLUXA_AGENT_TOKEN',
      }, { status: 500 });
    }

    // 发起 Fluxa Payout
    console.log('[Advance Payment] Initiating payout for advance:', id, 'amount:', amountUSD, 'to:', walletInfo.walletAddress);
    const result = await payoutService.initiateReimbursementPayout(
      id,
      walletInfo.walletAddress,
      amountUSD,
      `预借款付款 - ${advance.title}`,
      {
        userName: advanceUser.name,
        userEmail: advanceUser.email,
        advanceTitle: advance.title,
        type: 'advance',
      }
    );

    if (result.success && result.payoutId) {
      // 更新预借款状态为 paid，记录 payoutId
      await db.update(advances)
        .set({
          status: 'paid',
          paidAt: new Date(),
          paymentId: result.payoutId,
          updatedAt: new Date(),
        })
        .where(eq(advances.id, id));

      return NextResponse.json({
        success: true,
        payoutId: result.payoutId,
        status: result.status,
        statusDescription: FluxaPayoutClient.getStatusDescription(result.status!),
        approvalUrl: result.approvalUrl,
        expiresAt: result.expiresAt,
        amountUSDC: amountUSD,
        toAddress: walletInfo.walletAddress,
        message: '预借款打款请求已创建，请点击审批链接在钱包中完成审批',
      });
    } else {
      const errorCode = result.error?.code || 'UNKNOWN';
      const errorMessage = result.error?.message || '创建打款请求失败';
      console.error('[Advance Payment] Payout creation failed:', errorCode, errorMessage);

      let userMessage = errorMessage;
      if (errorCode === 'JWT_REFRESH_FAILED') {
        userMessage = 'Fluxa 认证失败，请检查 FLUXA_AGENT_ID 和 FLUXA_AGENT_TOKEN 是否正确';
      } else if (errorCode === 'NETWORK_ERROR') {
        userMessage = 'Fluxa 服务连接失败，请检查网络或稍后重试';
      }

      return NextResponse.json({
        success: false,
        error: errorCode,
        message: userMessage,
        details: result.error?.details,
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Process advance payment error:', error);
    return NextResponse.json({
      success: false,
      error: '预借款付款处理失败',
      message: error instanceof Error ? error.message : '服务器内部错误',
    }, { status: 500 });
  }
}
