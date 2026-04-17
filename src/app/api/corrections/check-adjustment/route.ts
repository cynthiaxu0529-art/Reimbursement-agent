/**
 * 冲差调整查询 API
 *
 * GET /api/corrections/check-adjustment?reimbursementId=xxx
 * 查询某报销单在打款前是否需要冲差抵扣，返回建议打款金额
 *
 * 认证：Session（浏览器）或 API Key（Agent），scope = payment:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';
import { calculateAdjustedPaymentAmount } from '@/lib/corrections/correction-service';
import { authenticate } from '@/lib/auth/api-key';
import { API_SCOPES } from '@/lib/auth/scopes';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 统一认证（Session 或 API Key）
    const authResult = await authenticate(request, API_SCOPES.PAYMENT_READ);
    if (!authResult.success) {
      return apiError(authResult.error, authResult.statusCode);
    }
    const authCtx = authResult.context;
    const tenantId = authCtx.tenantId ?? authCtx.user.tenantId;
    if (!tenantId) {
      return apiError('当前用户未绑定租户', 403);
    }

    // 角色校验：只有具备付款权限的用户/agent 才能查询该报销的冲差建议。
    // 这一层可以防止普通员工 agent 借此嗅探他人待冲差。
    const [currentUser] = await db
      .select({ role: users.role, roles: users.roles })
      .from(users)
      .where(eq(users.id, authCtx.userId))
      .limit(1);

    const userRoles = getUserRoles(currentUser || {});
    if (!canProcessPayment(userRoles)) {
      return apiError('没有权限', 403);
    }

    const { searchParams } = new URL(request.url);
    const reimbursementId = searchParams.get('reimbursementId');

    if (!reimbursementId) {
      return apiError('缺少 reimbursementId', 400);
    }

    const result = await calculateAdjustedPaymentAmount(tenantId, reimbursementId);

    // `hasCorrections` 涵盖两种应显示横幅的场景：
    //  1. 存在 pending 冲差（可能需要 apply）
    //  2. 本报销单已经被历史冲差抵扣过（alreadyOffset > 0）
    // 后者一旦发生，即便 pending 为空也要在 UI 上提示，并阻止对 Fluxa 发全额打款（避免双付）。
    const hasPending = result.corrections.length > 0;
    const hasHistoricalOffset = result.alreadyOffset > 0;
    const hasCorrections = hasPending || hasHistoricalOffset;

    let message: string;
    if (hasPending && hasHistoricalOffset) {
      message = `该报销单已被历史抵扣 $${result.alreadyOffset.toFixed(2)}，另有 ${result.corrections.length} 笔待冲差。建议打款 $${result.adjustedAmount.toFixed(2)}（原金额 $${result.originalAmount.toFixed(2)}）`;
    } else if (hasPending) {
      message = `该员工有 ${result.corrections.length} 笔待冲差记录，建议打款金额从 $${result.originalAmount.toFixed(2)} 调整为 $${result.adjustedAmount.toFixed(2)}`;
    } else if (hasHistoricalOffset) {
      message = `本报销单已被历史冲差抵扣 $${result.alreadyOffset.toFixed(2)}，应付余额 $${result.adjustedAmount.toFixed(2)}`;
    } else {
      message = '无待冲差记录';
    }

    return NextResponse.json({
      success: true,
      ...result,
      hasCorrections,
      hasHistoricalOffset,
      hasPending,
      message,
    });
  } catch (error) {
    console.error('Check adjustment error:', error);
    const message = error instanceof Error ? error.message : '查询冲差调整失败';
    return apiError(message, 400);
  }
}
