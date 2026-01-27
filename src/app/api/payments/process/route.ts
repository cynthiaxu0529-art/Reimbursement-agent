import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, users, payments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  createFluxaPayoutService,
  FluxaPayoutClient,
} from '@/lib/fluxa-payout';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payments/process
 * 财务发起打款 - 通过 Fluxa Payout 创建付款请求
 * 返回审批URL供财务在钱包中审批
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 权限检查：前端通过 localStorage 角色切换控制 UI 访问，
    // 后端只验证用户已登录且属于同一租户（与审批 API 保持一致）
    // 实际打款安全由 Fluxa 钱包审批环节保障

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

    // 验证钱包地址格式
    const evmAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!evmAddressRegex.test(walletInfo.walletAddress)) {
      return NextResponse.json({
        success: false,
        error: '钱包地址格式无效',
        message: '需要有效的 Base 链钱包地址 (0x开头的40位十六进制)',
      }, { status: 400 });
    }

    // 计算付款金额（使用美元/USDC）
    const amountUSD = reimbursement.totalAmountInBaseCurrency ||
      Number(reimbursement.totalAmount) * 0.14;

    // 初始化 Fluxa Payout 服务
    const payoutService = createFluxaPayoutService();

    // 检查配置
    if (!payoutService.isConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'Fluxa 钱包未配置',
        message: '请在环境变量中配置 FLUXA_AGENT_ID 和 FLUXA_AGENT_TOKEN',
      }, { status: 500 });
    }

    // 发起 Fluxa Payout
    const result = await payoutService.initiateReimbursementPayout(
      reimbursement.id,
      walletInfo.walletAddress,
      amountUSD,
      `报销付款 - ${reimbursement.title}`,
      {
        userName: user.name,
        userEmail: user.email,
        reimbursementTitle: reimbursement.title,
      }
    );

    if (result.success && result.payoutId) {
      // 创建支付记录
      await db.insert(payments).values({
        reimbursementId: reimbursement.id,
        amount: amountUSD,
        currency: 'USDC',
        transactionId: result.payoutId,
        paymentProvider: 'fluxa',
        status: 'pending_authorization',
        payoutId: result.payoutId,
        approvalUrl: result.approvalUrl,
        payoutStatus: result.status,
        expiresAt: result.expiresAt ? new Date(result.expiresAt * 1000) : null,
        toAddress: walletInfo.walletAddress,
        initiatedBy: session.user.id,
        updatedAt: new Date(),
      });

      // 更新报销单状态为处理中
      await db.update(reimbursements)
        .set({
          status: 'processing',
          updatedAt: new Date(),
          aiSuggestions: [
            ...(reimbursement.aiSuggestions as any[] || []),
            {
              type: 'fluxa_payout_initiated',
              payoutId: result.payoutId,
              approvalUrl: result.approvalUrl,
              status: result.status,
              initiatedAt: new Date().toISOString(),
              initiatedBy: session.user.id,
              amountUSDC: amountUSD,
            },
          ],
        })
        .where(eq(reimbursements.id, reimbursementId));

      return NextResponse.json({
        success: true,
        payoutId: result.payoutId,
        status: result.status,
        statusDescription: FluxaPayoutClient.getStatusDescription(result.status!),
        approvalUrl: result.approvalUrl,
        expiresAt: result.expiresAt,
        amountUSDC: amountUSD,
        toAddress: walletInfo.walletAddress,
        message: '打款请求已创建，请点击审批链接在钱包中完成审批',
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
        message: result.error?.message || '创建打款请求失败',
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
