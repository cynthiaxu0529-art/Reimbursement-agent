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

    return NextResponse.json({
      success: true,
      ...result,
      hasCorrections: result.corrections.length > 0,
      message: result.corrections.length > 0
        ? `该员工有 ${result.corrections.length} 笔待冲差记录，建议打款金额从 $${result.originalAmount.toFixed(2)} 调整为 $${result.adjustedAmount.toFixed(2)}`
        : '无待冲差记录',
    });
  } catch (error) {
    console.error('Check adjustment error:', error);
    const message = error instanceof Error ? error.message : '查询冲差调整失败';
    return apiError(message, 400);
  }
}
