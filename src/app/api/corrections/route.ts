/**
 * 费用冲差 API
 *
 * POST /api/corrections - 创建冲差记录（财务标记错误报销）
 * GET  /api/corrections - 获取冲差记录列表
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';
import { createCorrection, listCorrections } from '@/lib/corrections/correction-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/corrections
 * 财务创建冲差记录
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 权限检查：只有财务/超级管理员可创建冲差
    const [currentUser] = await db
      .select({ role: users.role, roles: users.roles })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const userRoles = getUserRoles(currentUser || {});
    if (!canProcessPayment(userRoles)) {
      return NextResponse.json({ error: '没有权限创建冲差记录' }, { status: 403 });
    }

    const body = await request.json();
    const { originalReimbursementId, correctedAmount, reason, correctionNote, errorCategory } = body;

    if (!originalReimbursementId) {
      return NextResponse.json({ error: '缺少原报销单ID' }, { status: 400 });
    }
    if (correctedAmount === undefined || correctedAmount === null) {
      return NextResponse.json({ error: '缺少正确金额' }, { status: 400 });
    }
    if (typeof correctedAmount !== 'number' || correctedAmount < 0) {
      return NextResponse.json({ error: '正确金额必须为非负数' }, { status: 400 });
    }
    if (!reason || typeof reason !== 'string') {
      return NextResponse.json({ error: '缺少错误原因说明' }, { status: 400 });
    }

    const correction = await createCorrection({
      tenantId: session.user.tenantId,
      originalReimbursementId,
      correctedAmount,
      reason,
      correctionNote,
      errorCategory,
      flaggedBy: session.user.id,
    });

    return NextResponse.json({
      success: true,
      correction,
      message: correction.differenceAmount > 0
        ? `已标记多付 $${Math.abs(correction.differenceAmount).toFixed(2)}，将在该员工后续报销中抵扣`
        : `已标记少付 $${Math.abs(correction.differenceAmount).toFixed(2)}，将在该员工后续报销中补付`,
    });
  } catch (error) {
    console.error('Create correction error:', error);
    const message = error instanceof Error ? error.message : '创建冲差记录失败';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * GET /api/corrections
 * 获取冲差记录列表
 *
 * Query params:
 *   status - 过滤状态 (pending/partial/settled/cancelled)
 *   employeeId - 过滤员工
 */
export async function GET(request: NextRequest) {
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
      return NextResponse.json({ error: '没有权限查看冲差记录' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const employeeId = searchParams.get('employeeId') || undefined;

    const corrections = await listCorrections(session.user.tenantId, {
      status,
      employeeId,
    });

    return NextResponse.json({ success: true, corrections });
  } catch (error) {
    console.error('List corrections error:', error);
    return NextResponse.json({ error: '获取冲差记录失败' }, { status: 500 });
  }
}
