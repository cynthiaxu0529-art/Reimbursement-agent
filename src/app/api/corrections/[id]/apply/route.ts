/**
 * 冲差抵扣 API
 *
 * POST /api/corrections/[id]/apply - 将冲差应用到新报销单
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';
import { applyCorrection } from '@/lib/corrections/correction-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/corrections/[id]/apply
 * 将冲差金额应用到目标报销单
 *
 * Body:
 *   targetReimbursementId - 用于抵扣的新报销单ID
 *   appliedAmount         - 本次抵扣金额
 *   note                  - 备注（可选）
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
    const [currentUser] = await db
      .select({ role: users.role, roles: users.roles })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const userRoles = getUserRoles(currentUser || {});
    if (!canProcessPayment(userRoles)) {
      return NextResponse.json({ error: '没有权限执行冲差抵扣' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { targetReimbursementId, appliedAmount, note } = body;

    if (!targetReimbursementId) {
      return NextResponse.json({ error: '缺少目标报销单ID' }, { status: 400 });
    }
    if (!appliedAmount || typeof appliedAmount !== 'number' || appliedAmount <= 0) {
      return NextResponse.json({ error: '抵扣金额必须大于0' }, { status: 400 });
    }

    const result = await applyCorrection({
      correctionId: id,
      targetReimbursementId,
      appliedAmount,
      note,
      appliedBy: session.user.id,
    });

    return NextResponse.json({
      success: true,
      application: result.application,
      correctionStatus: result.correctionStatus,
      remainingAmount: result.remainingAmount,
      adjustedPaymentAmount: result.adjustedPaymentAmount,
      message: `已抵扣 $${appliedAmount.toFixed(2)}，调整后打款金额为 $${result.adjustedPaymentAmount.toFixed(2)}`,
    });
  } catch (error) {
    console.error('Apply correction error:', error);
    const rawMessage = error instanceof Error ? error.message : '冲差抵扣失败';
    // 把底层 DB / drizzle 错误转成用户友好提示，避免 SQL 细节泄漏到前端
    const isSchemaError = /column .* does not exist|relation .* does not exist|Failed query/i.test(rawMessage);
    const userMessage = isSchemaError
      ? '数据库迁移未完成，请联系管理员运行 drizzle/0012_add_correction_sync_tracking.sql（或重新部署让自动迁移执行）'
      : rawMessage;
    return NextResponse.json({ error: userMessage }, { status: 400 });
  }
}
