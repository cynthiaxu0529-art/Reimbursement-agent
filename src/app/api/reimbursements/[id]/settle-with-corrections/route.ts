/**
 * 冲差全额抵扣结清 API
 *
 * POST /api/reimbursements/[id]/settle-with-corrections
 *
 * 场景：当目标报销单的应付金额已经被员工待冲差完全抵扣（adjustedAmount <= 0），
 * 不再需要 Fluxa 打款。本接口原子（尽最大努力）完成：
 *   1. 将所有待冲差 applyCorrection 到该报销单
 *   2. 生成一条 amount=0 / provider='internal_offset' 的 payment 占位记录，
 *      保证「已付款」tab 显示一致
 *   3. 把报销状态从 approved 推进到 paid
 *
 * 认证：Session 或 API Key（scope payment:process）
 *
 * 返回体示例：
 *   { success: true, reimbursementId, totalOffset, appliedCorrections: [...], message }
 *
 * 失败（非 200）：
 *   400 — 该报销无待冲差 / 抵扣后仍 > 0（应走常规打款）
 *   404 — 报销不存在
 *   409 — 报销状态不是 approved / 已存在 pending payment 记录
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { reimbursements, users, payments } from '@/lib/db/schema';
import { eq, and, notInArray } from 'drizzle-orm';
import { authenticate } from '@/lib/auth/api-key';
import { API_SCOPES } from '@/lib/auth/scopes';
import { apiError } from '@/lib/api-error';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';
import {
  calculateAdjustedPaymentAmount,
  applyCorrection,
} from '@/lib/corrections/correction-service';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: reimbursementId } = await params;
    if (!reimbursementId) {
      return apiError('缺少报销单ID', 400);
    }

    const authResult = await authenticate(request, API_SCOPES.PAYMENT_PROCESS);
    if (!authResult.success) {
      return apiError(authResult.error, authResult.statusCode);
    }
    const authCtx = authResult.context;
    const tenantId = authCtx.tenantId ?? authCtx.user.tenantId;
    if (!tenantId) {
      return apiError('当前用户未绑定租户', 403);
    }

    // 权限校验
    const [currentUser] = await db
      .select({ role: users.role, roles: users.roles })
      .from(users)
      .where(eq(users.id, authCtx.userId))
      .limit(1);
    const userRoles = getUserRoles(currentUser || {});
    if (!canProcessPayment(userRoles)) {
      return apiError('没有权限发起结清，需要财务或管理员角色', 403);
    }

    // 拉报销单
    const [reimbursement] = await db
      .select()
      .from(reimbursements)
      .where(and(
        eq(reimbursements.id, reimbursementId),
        eq(reimbursements.tenantId, tenantId),
      ))
      .limit(1);

    if (!reimbursement) {
      return apiError('报销单不存在', 404);
    }

    if (reimbursement.status !== 'approved') {
      return apiError(
        `只有已审批的报销单可以通过冲差结清，当前状态：${reimbursement.status}`,
        409,
      );
    }

    // 防并发：检查是否已有 pending payment
    const existingPayments = await db
      .select({ id: payments.id, status: payments.status })
      .from(payments)
      .where(and(
        eq(payments.reimbursementId, reimbursementId),
        notInArray(payments.status, ['failed', 'expired', 'cancelled']),
      ))
      .limit(1);

    if (existingPayments.length > 0) {
      return apiError('该报销单已存在未终态的付款记录，请勿重复结清', 409);
    }

    // 计算待冲差
    const adj = await calculateAdjustedPaymentAmount(tenantId, reimbursementId);

    if (adj.corrections.length === 0) {
      return apiError('该报销单没有待冲差记录，无需结清', 400);
    }

    if (adj.adjustedAmount > 0) {
      return apiError(
        `抵扣后仍有 $${adj.adjustedAmount.toFixed(2)} 需打款，请走常规付款流程`,
        400,
      );
    }

    // 循环 apply。若单条失败则停止，并返回已应用列表供排查；不继续推进状态。
    const appliedCorrections: Array<{
      correctionId: string;
      appliedAmount: number;
      direction: 'deduct' | 'supplement';
      ok: boolean;
      error?: string;
    }> = [];
    let totalOffset = 0;
    for (const c of adj.corrections) {
      const appliedAmount = Math.abs(c.suggestedDeduction);
      try {
        await applyCorrection({
          correctionId: c.correctionId,
          targetReimbursementId: reimbursementId,
          appliedAmount,
          note: '全额抵扣结清',
          appliedBy: authCtx.userId,
        });
        appliedCorrections.push({
          correctionId: c.correctionId,
          appliedAmount,
          direction: c.suggestedDeduction > 0 ? 'deduct' : 'supplement',
          ok: true,
        });
        totalOffset += appliedAmount;
      } catch (err) {
        console.error('[settle-with-corrections] applyCorrection failed:', c.correctionId, err);
        appliedCorrections.push({
          correctionId: c.correctionId,
          appliedAmount,
          direction: c.suggestedDeduction > 0 ? 'deduct' : 'supplement',
          ok: false,
          error: err instanceof Error ? err.message : 'unknown',
        });
        // 出错即停：不推进状态，让调用方决定是重试还是人工处理
        return NextResponse.json({
          success: false,
          error: '部分冲差应用失败，状态未推进',
          appliedCorrections,
          message: '请检查失败原因后重试，或到冲差管理页手工补齐',
        }, { status: 500 });
      }
    }

    // 生成 $0 payment 占位记录（provider='internal_offset'），便于历史列表、统计一致
    const now = new Date();
    await db.insert(payments).values({
      reimbursementId: reimbursement.id,
      amount: 0,
      currency: reimbursement.baseCurrency || 'USD',
      transactionId: null,
      paymentProvider: 'internal_offset',
      status: 'succeeded',
      payoutStatus: 'offset_settled',
      toAddress: null,
      initiatedBy: authCtx.userId,
      paidAt: now,
      updatedAt: now,
    });

    // 报销状态 approved → paid，并在 aiSuggestions 记录结清标记
    await db
      .update(reimbursements)
      .set({
        status: 'paid',
        updatedAt: now,
        aiSuggestions: [
          ...((reimbursement.aiSuggestions as any[]) || []),
          {
            type: 'settled_via_corrections',
            appliedCorrections: appliedCorrections.map(ac => ({
              correctionId: ac.correctionId,
              appliedAmount: ac.appliedAmount,
              direction: ac.direction,
            })),
            totalOffset,
            settledAt: now.toISOString(),
            settledBy: authCtx.userId,
          },
        ],
      })
      .where(eq(reimbursements.id, reimbursementId));

    return NextResponse.json({
      success: true,
      reimbursementId,
      totalOffset,
      appliedCorrections,
      message: `已通过冲差全额抵扣结清（共抵扣 $${totalOffset.toFixed(2)}，无需打款）`,
    });
  } catch (error) {
    console.error('Settle with corrections error:', error);
    const message = error instanceof Error ? error.message : '抵扣结清失败';
    return apiError(message, 500);
  }
}
