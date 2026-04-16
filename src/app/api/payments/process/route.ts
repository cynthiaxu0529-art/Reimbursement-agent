import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, users, payments } from '@/lib/db/schema';
import { eq, and, notInArray } from 'drizzle-orm';
import {
  createFluxaPayoutService,
  FluxaPayoutClient,
} from '@/lib/fluxa-payout';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';
import {
  calculateAdjustedPaymentAmount,
  applyCorrection,
} from '@/lib/corrections/correction-service';

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

    // 权限检查：从数据库查询当前用户角色，只有财务/管理员可发起打款
    const [currentUser] = await db.select({ role: users.role, roles: users.roles })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const userRoles = getUserRoles(currentUser || {});
    if (!canProcessPayment(userRoles)) {
      return NextResponse.json({ error: '没有权限发起付款，需要财务或管理员角色' }, { status: 403 });
    }

    const { reimbursementId, customAmount } = await request.json();

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
      return NextResponse.json({
        success: false,
        error: '该报销单当前状态不允许付款',
        message: reimbursement.status === 'processing'
          ? '该报销单已提交付款，正在处理中，请勿重复提交'
          : reimbursement.status === 'paid'
            ? '该报销单已完成付款'
            : '只有已批准的报销单可以付款',
      }, { status: 400 });
    }

    // 防重复：检查是否已有未终态的 payment 记录
    const existingPayments = await db.select({
      id: payments.id,
      payoutId: payments.payoutId,
      status: payments.status,
      approvalUrl: payments.approvalUrl,
    })
      .from(payments)
      .where(and(
        eq(payments.reimbursementId, reimbursementId),
        notInArray(payments.status, ['failed', 'expired', 'cancelled']),
      ))
      .limit(1);

    if (existingPayments.length > 0) {
      const existing = existingPayments[0];
      return NextResponse.json({
        success: false,
        error: '该报销单已提交付款，请勿重复操作',
        message: '如需重新提交，请等待当前付款过期或失败后再试',
        existingPayoutId: existing.payoutId,
        existingStatus: existing.status,
        approvalUrl: existing.approvalUrl,
      }, { status: 409 });
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

    // 计算付款金额（使用本位币/USDC）
    const originalAmountUSD = reimbursement.totalAmountInBaseCurrency ||
      Number(reimbursement.totalAmount);

    // 如果财务提供了自定义金额，使用自定义金额（但不能超过原金额）
    let amountUSD = originalAmountUSD;
    let isCustomAmount = false;

    if (customAmount !== undefined && customAmount !== null) {
      const parsedCustomAmount = parseFloat(customAmount);
      if (isNaN(parsedCustomAmount) || parsedCustomAmount <= 0) {
        return NextResponse.json({
          success: false,
          error: '自定义金额无效',
          message: '打款金额必须大于 0',
        }, { status: 400 });
      }

      if (parsedCustomAmount > originalAmountUSD) {
        return NextResponse.json({
          success: false,
          error: '自定义金额超过报销金额',
          message: `打款金额 ${parsedCustomAmount} 不能超过报销金额 ${originalAmountUSD.toFixed(2)} USDC`,
        }, { status: 400 });
      }

      amountUSD = parsedCustomAmount;
      isCustomAmount = true;
    }

    // 冲差自动抵扣：仅在未提供 customAmount（财务未手工覆盖）时生效。
    // 提供 customAmount 视为显式覆盖，跳过自动抵扣，由财务人工负责。
    type PendingCorrection = {
      correctionId: string;
      appliedAmount: number;
      direction: 'deduct' | 'supplement';
      reason: string;
    };
    let pendingCorrections: PendingCorrection[] = [];
    let correctionOriginalAmount = originalAmountUSD;
    let correctionAdjustedAmount = originalAmountUSD;

    // 多冲差精度门：员工待冲差 > 1 笔时不做自动匹配，避免把不相关的费用胡乱对账。
    // 财务在付款页能看到提示，自行去冲差管理页人工选择哪笔抵扣到哪张报销。
    let multiCorrectionDeferred = false;
    if (!isCustomAmount) {
      try {
        const adj = await calculateAdjustedPaymentAmount(
          session.user.tenantId,
          reimbursementId,
        );
        correctionOriginalAmount = adj.originalAmount;
        correctionAdjustedAmount = adj.adjustedAmount;

        if (adj.pendingCorrectionCount > 1) {
          // 多笔待冲差：跳过自动抵扣，按原金额打款，并在响应里告知调用方
          multiCorrectionDeferred = true;
        } else if (adj.corrections.length > 0) {
          // 仅 1 笔待冲差：保留原本的自动抵扣行为
          pendingCorrections = adj.corrections.map((c) => ({
            correctionId: c.correctionId,
            // suggestedDeduction 多付为正、少付为负；applyCorrection 只接受正数 appliedAmount
            appliedAmount: Math.abs(c.suggestedDeduction),
            direction: c.suggestedDeduction > 0 ? 'deduct' : 'supplement',
            reason: c.reason,
          }));
          amountUSD = adj.adjustedAmount;
        }
      } catch (err) {
        // 冲差查询失败时不阻断付款——按原金额走，并告警记录
        console.warn('[Payment] calculateAdjustedPaymentAmount failed, paying original amount:', err);
      }
    }

    // 自动抵扣后金额 ≤ 0：Fluxa 不接受 $0 payout。
    // 提示前端走 settle-with-corrections 端点结清（前端会在收到此信号后
    // 展示「抵扣结清」按钮或直接调用结清端点）。
    if (amountUSD <= 0) {
      return NextResponse.json({
        success: false,
        error: 'FULL_OFFSET_REQUIRED',
        code: 'FULL_OFFSET_REQUIRED',
        message: `该报销单完全被冲差抵扣（原金额 $${originalAmountUSD.toFixed(2)}，待冲差共 $${(correctionOriginalAmount - correctionAdjustedAmount).toFixed(2)}）。请调用 POST /api/reimbursements/${reimbursementId}/settle-with-corrections 完成无打款结清。`,
        correctionOriginalAmount,
        correctionAdjustedAmount,
        pendingCorrectionCount: pendingCorrections.length,
        settleEndpoint: `/api/reimbursements/${reimbursementId}/settle-with-corrections`,
      }, { status: 400 });
    }

    // 初始化 Fluxa Payout 服务
    const payoutService = createFluxaPayoutService();

    // 检查配置
    if (!payoutService.isConfigured()) {
      console.error('Fluxa payout not configured. FLUXA_AGENT_ID:', !!process.env.FLUXA_AGENT_ID, 'FLUXA_AGENT_TOKEN:', !!process.env.FLUXA_AGENT_TOKEN);
      return NextResponse.json({
        success: false,
        error: 'Fluxa 钱包未配置',
        message: '请在环境变量中配置 FLUXA_AGENT_ID 和 FLUXA_AGENT_TOKEN',
      }, { status: 500 });
    }

    // 发起 Fluxa Payout
    console.log('[Payment] Initiating payout for reimbursement:', reimbursement.id, 'amount:', amountUSD, 'to:', walletInfo.walletAddress);
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
      // 先记录冲差抵扣（此时报销状态仍为 approved，applyCorrection 才不会被拒）。
      // 注意：payout 已经发起成功，如果这里失败，钱在路上但冲差无法回写——
      // 不阻断后续 payment 记录与 status 更新，而是把失败信息写进 aiSuggestions 供人工跟进。
      const appliedCorrections: Array<{
        correctionId: string;
        appliedAmount: number;
        direction: 'deduct' | 'supplement';
        ok: boolean;
        error?: string;
      }> = [];
      for (const pc of pendingCorrections) {
        try {
          await applyCorrection({
            correctionId: pc.correctionId,
            targetReimbursementId: reimbursement.id,
            appliedAmount: pc.appliedAmount,
            note: '付款时自动抵扣',
            appliedBy: session.user.id,
          });
          appliedCorrections.push({
            correctionId: pc.correctionId,
            appliedAmount: pc.appliedAmount,
            direction: pc.direction,
            ok: true,
          });
        } catch (err) {
          console.error('[Payment] applyCorrection failed post-payout:', pc.correctionId, err);
          appliedCorrections.push({
            correctionId: pc.correctionId,
            appliedAmount: pc.appliedAmount,
            direction: pc.direction,
            ok: false,
            error: err instanceof Error ? err.message : 'unknown',
          });
        }
      }

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

      // 计算 adjustmentReason
      let adjustmentReason: string | undefined;
      if (isCustomAmount) {
        adjustmentReason = '财务根据政策限额调整打款金额';
      } else if (appliedCorrections.length > 0) {
        adjustmentReason = `自动抵扣 ${appliedCorrections.filter(c => c.ok).length} 笔冲差`;
      }

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
              originalAmountUSDC: originalAmountUSD,
              isCustomAmount,
              adjustmentReason,
              appliedCorrections: appliedCorrections.length > 0 ? appliedCorrections : undefined,
            },
          ],
        })
        .where(eq(reimbursements.id, reimbursementId));

      const correctionSuccessCount = appliedCorrections.filter(c => c.ok).length;
      const correctionFailureCount = appliedCorrections.length - correctionSuccessCount;
      let message: string;
      if (isCustomAmount) {
        message = `打款请求已创建（金额已调整为 $${amountUSD.toFixed(2)}），请点击审批链接在钱包中完成审批`;
      } else if (correctionSuccessCount > 0) {
        message = `打款请求已创建（已自动抵扣 ${correctionSuccessCount} 笔冲差，实际打款 $${amountUSD.toFixed(2)}）${correctionFailureCount > 0 ? `；另有 ${correctionFailureCount} 笔抵扣失败，请手工检查` : ''}，请点击审批链接在钱包中完成审批`;
      } else if (multiCorrectionDeferred) {
        message = `打款请求已创建（按原金额 $${amountUSD.toFixed(2)} 打款）。该员工有多笔待冲差，系统未自动抵扣，请到冲差管理页人工选择哪笔抵扣到哪张报销。`;
      } else {
        message = '打款请求已创建，请点击审批链接在钱包中完成审批';
      }

      return NextResponse.json({
        success: true,
        payoutId: result.payoutId,
        status: result.status,
        statusDescription: FluxaPayoutClient.getStatusDescription(result.status!),
        approvalUrl: result.approvalUrl,
        expiresAt: result.expiresAt,
        amountUSDC: amountUSD,
        originalAmountUSDC: originalAmountUSD,
        isCustomAmount,
        appliedCorrections: appliedCorrections.length > 0 ? appliedCorrections : undefined,
        correctionAdjustedAmount: !isCustomAmount && pendingCorrections.length > 0
          ? correctionAdjustedAmount
          : undefined,
        correctionOriginalAmount: !isCustomAmount && pendingCorrections.length > 0
          ? correctionOriginalAmount
          : undefined,
        multiCorrectionDeferred: multiCorrectionDeferred ? true : undefined,
        toAddress: walletInfo.walletAddress,
        message,
      });
    } else {
      const errorCode = result.error?.code || 'UNKNOWN';
      const errorMessage = result.error?.message || '创建打款请求失败';
      console.error('[Payment] Payout creation failed:', errorCode, errorMessage, result.error?.details);

      // 根据错误码提供具体的修复建议
      let userMessage = errorMessage;
      if (errorCode === 'JWT_REFRESH_FAILED') {
        userMessage = 'Fluxa 认证失败，请检查 FLUXA_AGENT_ID 和 FLUXA_AGENT_TOKEN 是否正确';
      } else if (errorCode === 'NETWORK_ERROR') {
        userMessage = 'Fluxa 服务连接失败，请检查网络或稍后重试';
      } else if (errorCode === 'INVALID_ADDRESS') {
        userMessage = '收款钱包地址格式无效，请联系员工更新钱包地址';
      }

      return NextResponse.json({
        success: false,
        error: errorCode,
        message: userMessage,
        details: result.error?.details,
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Process payment error:', error);
    return NextResponse.json({
      success: false,
      error: '付款处理失败',
      message: error instanceof Error ? error.message : '服务器内部错误，请查看日志',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
