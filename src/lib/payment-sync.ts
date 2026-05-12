/**
 * 付款状态同步工具
 *
 * 单次同步逻辑被 3 处复用：
 *   1. POST /api/payments/sync-status    财务点单条「同步状态」
 *   2. POST /api/payments/sync-all-pending 财务一键批量同步所有在途
 *   3. GET  /api/cron/sync-payment-status Vercel cron 定时扫描
 *
 * 关键不变量：
 *   - 仅当 isSuccess && currentStatus !== 'paid' 时把 reimbursement 改 paid
 *   - 失败/过期且当前是 processing 时回退 approved
 *   - 已是 paid 的不管 Fluxa 返回啥都不动（防止误改）
 */

import { db } from '@/lib/db';
import { payments, reimbursements } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import {
  createFluxaPayoutClient,
  FluxaPayoutClient,
} from '@/lib/fluxa-payout';

/** Fluxa 在途状态 —— 这些是需要拉取最新结果的状态 */
export const IN_FLIGHT_PAYOUT_STATUSES = [
  'pending_authorization',
  'authorized',
  'signed',
  'broadcasting',
] as const;

export interface SyncOneResult {
  paymentId: string;
  payoutId: string;
  /** 同步前的 fluxa 状态 */
  prevStatus: string | null;
  /** 同步后的 fluxa 状态 */
  newStatus: string;
  /** true = 成功最终态 */
  isSuccess: boolean;
  /** 是否更新了 payments / reimbursements 表 */
  dbUpdated: boolean;
  /** 报销单是否被改为 paid */
  reimbursementMarkedPaid: boolean;
  /** 报销单是否被回滚到 approved（失败/过期）*/
  reimbursementRolledBack: boolean;
  /** 失败时的错误信息 */
  error?: string;
}

/**
 * 同步单个 payment 的 Fluxa 状态。
 *
 * 调用方负责权限校验、tenant 隔离——这里只做纯同步操作。
 *
 * @param paymentId  本地 payments 表的 ID（不是 payoutId）
 */
export async function syncOnePayment(paymentId: string): Promise<SyncOneResult> {
  const [existing] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);

  if (!existing) {
    return makeError(paymentId, '', null, 'payment 不存在');
  }
  if (!existing.payoutId) {
    return makeError(paymentId, '', existing.payoutStatus, 'payment 没有 payoutId，无法查询 Fluxa');
  }

  const client = createFluxaPayoutClient();
  if (!client.isConfigured()) {
    return makeError(paymentId, existing.payoutId, existing.payoutStatus, 'Fluxa 未配置');
  }

  const result = await client.getPayoutStatus(existing.payoutId);
  if (!result.success || !result.payout) {
    return makeError(
      paymentId,
      existing.payoutId,
      existing.payoutStatus,
      result.error?.message || 'Fluxa 查询失败',
    );
  }

  const payout = result.payout;
  const fluxaStatus = payout.status;
  const isSuccess = FluxaPayoutClient.isSuccessStatus(fluxaStatus);
  const now = new Date();

  // ── 1. 更新 payments
  await db
    .update(payments)
    .set({
      payoutStatus: fluxaStatus,
      txHash: payout.txHash,
      status: isSuccess
        ? 'success'
        : fluxaStatus === 'failed' || fluxaStatus === 'expired'
          ? 'failed'
          : existing.status,
      paidAt: isSuccess && !existing.paidAt ? now : existing.paidAt,
      updatedAt: now,
    })
    .where(eq(payments.id, existing.id));

  // ── 2. 更新 reimbursements（按当前状态决定是否动）
  let reimbursementMarkedPaid = false;
  let reimbursementRolledBack = false;

  const [reimb] = await db
    .select({ status: reimbursements.status, tenantId: reimbursements.tenantId })
    .from(reimbursements)
    .where(eq(reimbursements.id, existing.reimbursementId))
    .limit(1);
  const currentStatus = reimb?.status;

  if (isSuccess && currentStatus && currentStatus !== 'paid') {
    await db
      .update(reimbursements)
      .set({
        status: 'paid',
        paidAt: now,
        updatedAt: now,
      })
      .where(eq(reimbursements.id, existing.reimbursementId));
    reimbursementMarkedPaid = true;
  } else if (
    (fluxaStatus === 'failed' || fluxaStatus === 'expired') &&
    currentStatus === 'processing'
  ) {
    await db
      .update(reimbursements)
      .set({
        status: 'approved',
        updatedAt: now,
      })
      .where(eq(reimbursements.id, existing.reimbursementId));
    reimbursementRolledBack = true;
  }

  return {
    paymentId,
    payoutId: existing.payoutId,
    prevStatus: existing.payoutStatus,
    newStatus: fluxaStatus,
    isSuccess,
    dbUpdated: true,
    reimbursementMarkedPaid,
    reimbursementRolledBack,
  };
}

function makeError(
  paymentId: string,
  payoutId: string,
  prevStatus: string | null,
  error: string,
): SyncOneResult {
  return {
    paymentId,
    payoutId,
    prevStatus,
    newStatus: prevStatus || '',
    isSuccess: false,
    dbUpdated: false,
    reimbursementMarkedPaid: false,
    reimbursementRolledBack: false,
    error,
  };
}

export interface BulkSyncResult {
  /** 扫描到的在途 payment 数 */
  totalScanned: number;
  /** 实际成功更新的数量 */
  totalUpdated: number;
  /** 转为 paid 的报销单数 */
  markedPaid: number;
  /** 回滚到 approved 的报销单数（失败/过期）*/
  rolledBack: number;
  /** 失败条数 */
  errors: number;
  /** 每条详情（按 newStatus 简单分类）*/
  details: SyncOneResult[];
}

/**
 * 批量同步在途 payments 的状态。
 *
 * @param filter.tenantId  限制租户（cron / admin 调用可选；财务用户调用必传）
 * @param filter.provider  默认 'fluxa'
 * @param filter.maxBatch  最多处理多少条（防止单次跑太久），默认 200
 */
export async function syncInFlightPayments(filter: {
  tenantId?: string;
  provider?: string;
  maxBatch?: number;
} = {}): Promise<BulkSyncResult> {
  const provider = filter.provider || 'fluxa';
  const maxBatch = filter.maxBatch ?? 200;

  // 拉所有在途 payment ids
  // tenantId 通过 join reimbursements 限制（payments 表自身没有 tenantId）
  let inFlightPayments;
  if (filter.tenantId) {
    inFlightPayments = await db
      .select({ id: payments.id })
      .from(payments)
      .innerJoin(reimbursements, eq(payments.reimbursementId, reimbursements.id))
      .where(
        and(
          eq(reimbursements.tenantId, filter.tenantId),
          eq(payments.paymentProvider, provider),
          inArray(payments.payoutStatus, IN_FLIGHT_PAYOUT_STATUSES as unknown as string[]),
        ),
      )
      .limit(maxBatch);
  } else {
    // 全租户扫（cron 路径）
    inFlightPayments = await db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.paymentProvider, provider),
          inArray(payments.payoutStatus, IN_FLIGHT_PAYOUT_STATUSES as unknown as string[]),
        ),
      )
      .limit(maxBatch);
  }

  const details: SyncOneResult[] = [];
  let markedPaid = 0;
  let rolledBack = 0;
  let totalUpdated = 0;
  let errors = 0;

  for (const p of inFlightPayments) {
    try {
      const result = await syncOnePayment(p.id);
      details.push(result);
      if (result.error) {
        errors += 1;
      } else if (result.dbUpdated) {
        totalUpdated += 1;
        if (result.reimbursementMarkedPaid) markedPaid += 1;
        if (result.reimbursementRolledBack) rolledBack += 1;
      }
    } catch (err) {
      errors += 1;
      details.push({
        paymentId: p.id,
        payoutId: '',
        prevStatus: null,
        newStatus: '',
        isSuccess: false,
        dbUpdated: false,
        reimbursementMarkedPaid: false,
        reimbursementRolledBack: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    totalScanned: inFlightPayments.length,
    totalUpdated,
    markedPaid,
    rolledBack,
    errors,
    details,
  };
}
