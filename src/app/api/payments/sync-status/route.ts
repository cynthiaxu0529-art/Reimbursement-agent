import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { payments, reimbursements, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';
import {
  createFluxaPayoutClient,
  FluxaPayoutClient,
} from '@/lib/fluxa-payout';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payments/sync-status
 * 直接调用 Fluxa API 同步付款状态（不依赖本地 payments 表）
 */
export async function POST(request: NextRequest) {
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
      return NextResponse.json({ error: '没有权限' }, { status: 403 });
    }

    const { payoutId, reimbursementId } = await request.json();
    console.log('[SyncStatus] 开始同步, payoutId:', payoutId, 'reimbursementId:', reimbursementId);

    if (!payoutId) {
      return NextResponse.json({ error: '缺少 payoutId' }, { status: 400 });
    }

    // 直接调用 Fluxa API
    const client = createFluxaPayoutClient();

    if (!client.isConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'Fluxa 未配置',
        message: '请检查 FLUXA_AGENT_ID 和 FLUXA_AGENT_TOKEN 环境变量',
      }, { status: 500 });
    }

    console.log('[SyncStatus] 调用 Fluxa API...');
    const result = await client.getPayoutStatus(payoutId);
    console.log('[SyncStatus] Fluxa 响应:', result.success, result.payout?.status, result.error?.message);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error?.message || '查询 Fluxa 失败',
        details: result.error,
      }, { status: 400 });
    }

    const payout = result.payout!;
    const fluxaStatus = payout.status;
    const isSuccess = FluxaPayoutClient.isSuccessStatus(fluxaStatus);

    console.log('[SyncStatus] Fluxa 状态:', fluxaStatus, '是否成功:', isSuccess);

    // 更新本地数据库
    let dbUpdated = false;

    // 更新 payments 表
    const [existingPayment] = await db.select()
      .from(payments)
      .where(eq(payments.payoutId, payoutId))
      .limit(1);

    if (existingPayment) {
      await db.update(payments)
        .set({
          payoutStatus: fluxaStatus,
          txHash: payout.txHash,
          status: isSuccess ? 'success' : (fluxaStatus === 'failed' || fluxaStatus === 'expired' ? 'failed' : existingPayment.status),
          paidAt: isSuccess ? new Date() : existingPayment.paidAt,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, existingPayment.id));
      dbUpdated = true;
      console.log('[SyncStatus] 已更新 payments 表');
    }

    // 更新 reimbursements 表
    if (reimbursementId && isSuccess) {
      await db.update(reimbursements)
        .set({
          status: 'paid',
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(reimbursements.id, reimbursementId),
          eq(reimbursements.tenantId, session.user.tenantId)
        ));
      dbUpdated = true;
      console.log('[SyncStatus] 已更新 reimbursements 表为 paid');
    } else if (reimbursementId && (fluxaStatus === 'failed' || fluxaStatus === 'expired')) {
      // 失败或过期，恢复为 approved
      await db.update(reimbursements)
        .set({
          status: 'approved',
          updatedAt: new Date(),
        })
        .where(and(
          eq(reimbursements.id, reimbursementId),
          eq(reimbursements.tenantId, session.user.tenantId)
        ));
      dbUpdated = true;
      console.log('[SyncStatus] 已更新 reimbursements 表为 approved (失败/过期)');
    }

    return NextResponse.json({
      success: true,
      payoutId: payout.payoutId,
      status: fluxaStatus,
      statusDescription: FluxaPayoutClient.getStatusDescription(fluxaStatus),
      isSuccess,
      isTerminal: FluxaPayoutClient.isTerminalStatus(fluxaStatus),
      txHash: payout.txHash,
      dbUpdated,
    });

  } catch (error) {
    console.error('[SyncStatus] 错误:', error);
    return NextResponse.json({
      success: false,
      error: '同步失败',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
