/**
 * 冲差调整查询 API
 *
 * GET /api/corrections/check-adjustment?reimbursementId=xxx
 * 查询某报销单在打款前是否需要冲差抵扣，返回建议打款金额
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';
import { calculateAdjustedPaymentAmount } from '@/lib/corrections/correction-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const [currentUser] = await db
      .select({ role: users.role, roles: users.roles })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const userRoles = getUserRoles(currentUser || {});
    if (!canProcessPayment(userRoles)) {
      return NextResponse.json({ error: '没有权限' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const reimbursementId = searchParams.get('reimbursementId');

    if (!reimbursementId) {
      return NextResponse.json({ error: '缺少 reimbursementId' }, { status: 400 });
    }

    const result = await calculateAdjustedPaymentAmount(
      session.user.tenantId,
      reimbursementId
    );

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
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
