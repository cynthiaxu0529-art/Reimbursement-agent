/**
 * 数据异常审计
 *
 * 扫描 payments 和 reimbursements 表的状态一致性，找出"看起来怪"的记录：
 *   - failed_but_paid       payment 失败但 reimbursement 标 paid（应该回滚或确认 retry 成功）
 *   - succeeded_but_not_paid payment 成功但 reimbursement 没标 paid（孤立状态）
 *   - rejected_with_inflight reimbursement 已 rejected 但 payment 还在途/已发起（应取消打款）
 *   - paid_no_payment       reimbursement 标 paid 但完全没 payment 记录（系统外打款？）
 *   - multiple_succeeded    一个 reimbursement 有多笔 succeeded payment（重复打款）
 *
 * 这些数据不会自动修——财务必须逐条决定怎么处理。我们提供 surface + action。
 */

import { db } from '@/lib/db';
import {
  payments,
  reimbursements,
  users,
  dataAnomalyReviews,
} from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

// 这些常量也在 PR #244 加到 payment-sync.ts；在那条 PR 合并前先 inline
// 一份，避免本 PR 等待 #244。合并冲突解决时统一从 payment-sync.ts 导。
const SUCCESS_PAYOUT_STATUSES = ['succeeded', 'success', 'confirmed'] as const;
const FAILED_PAYOUT_STATUSES = ['failed', 'expired'] as const;
const IN_FLIGHT_PAYOUT_STATUSES = [
  'pending_authorization',
  'authorized',
  'signed',
  'broadcasting',
] as const;

export type AnomalyType =
  | 'failed_but_paid'
  | 'succeeded_but_not_paid'
  | 'rejected_with_inflight'
  | 'paid_no_payment'
  | 'multiple_succeeded';

export interface AnomalyRow {
  /** 用于 review 表查询的唯一 key（type:resourceId）*/
  anomalyKey: string;
  type: AnomalyType;
  /** 关联的 payment（若有） */
  payment?: {
    id: string;
    payoutId: string | null;
    payoutStatus: string | null;
    amount: number;
    currency: string;
    paidAt: string | null;
    txHash: string | null;
  };
  /** 关联的 reimbursement */
  reimbursement: {
    id: string;
    title: string;
    status: string;
    totalAmountInBaseCurrency: number;
    baseCurrency: string;
    paidAt: string | null;
    userId: string;
    employee?: { name: string; email: string } | null;
  };
  /** 异常说明（自然语言）*/
  description: string;
  /** 审核状态（若已 review 过）*/
  review?: {
    status: 'reviewed' | 'accepted' | 'fixed';
    note: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
  };
}

/**
 * 扫描本租户所有数据异常。
 */
export async function detectAnomalies(tenantId: string): Promise<AnomalyRow[]> {
  // ── 拉本租户所有 reimbursements + 关联的 payments
  const allReimbs = await db
    .select({
      id: reimbursements.id,
      title: reimbursements.title,
      status: reimbursements.status,
      totalAmountInBaseCurrency: reimbursements.totalAmountInBaseCurrency,
      baseCurrency: reimbursements.baseCurrency,
      paidAt: reimbursements.paidAt,
      userId: reimbursements.userId,
    })
    .from(reimbursements)
    .where(eq(reimbursements.tenantId, tenantId));

  const reimbIds = allReimbs.map(r => r.id);
  const allPayments = reimbIds.length > 0
    ? await db
        .select()
        .from(payments)
        .where(inArray(payments.reimbursementId, reimbIds))
    : [];

  // 拉员工信息
  const userIds = Array.from(new Set(allReimbs.map(r => r.userId)));
  const userRecords = userIds.length > 0
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];
  const userMap = new Map(userRecords.map(u => [u.id, u]));

  // 拉已 review 的异常
  const reviews = await db
    .select()
    .from(dataAnomalyReviews)
    .where(eq(dataAnomalyReviews.tenantId, tenantId));
  const reviewMap = new Map(reviews.map(r => [r.anomalyKey, r]));

  // 按 reimbursement 分组 payments
  const paymentsByReimb = new Map<string, typeof allPayments>();
  for (const p of allPayments) {
    const arr = paymentsByReimb.get(p.reimbursementId) || [];
    arr.push(p);
    paymentsByReimb.set(p.reimbursementId, arr);
  }

  const reimbMap = new Map(allReimbs.map(r => [r.id, r]));
  const anomalies: AnomalyRow[] = [];

  const pushAnomaly = (
    type: AnomalyType,
    reimbursementId: string,
    paymentId: string | null,
    description: string,
  ) => {
    const r = reimbMap.get(reimbursementId);
    if (!r) return;
    const p = paymentId ? allPayments.find(pp => pp.id === paymentId) : undefined;
    // anomaly_key: type:paymentId (if exists) or type:reimbursementId
    const anomalyKey = paymentId ? `${type}:${paymentId}` : `${type}:${reimbursementId}`;
    const review = reviewMap.get(anomalyKey);
    anomalies.push({
      anomalyKey,
      type,
      reimbursement: {
        id: r.id,
        title: r.title,
        status: r.status as string,
        totalAmountInBaseCurrency: r.totalAmountInBaseCurrency,
        baseCurrency: r.baseCurrency,
        paidAt: r.paidAt ? r.paidAt.toISOString() : null,
        userId: r.userId,
        employee: userMap.get(r.userId) || null,
      },
      payment: p
        ? {
            id: p.id,
            payoutId: p.payoutId,
            payoutStatus: p.payoutStatus,
            amount: p.amount,
            currency: p.currency,
            paidAt: p.paidAt ? p.paidAt.toISOString() : null,
            txHash: p.txHash,
          }
        : undefined,
      description,
      review: review
        ? {
            status: review.status as 'reviewed' | 'accepted' | 'fixed',
            note: review.note,
            reviewedBy: review.reviewedBy,
            reviewedAt: review.reviewedAt ? review.reviewedAt.toISOString() : null,
          }
        : undefined,
    });
  };

  // ── 1. failed_but_paid: payment 失败但 reimb 是 paid
  for (const p of allPayments) {
    const r = reimbMap.get(p.reimbursementId);
    if (!r) continue;
    if (
      FAILED_PAYOUT_STATUSES.includes(p.payoutStatus as never) &&
      r.status === 'paid'
    ) {
      pushAnomaly(
        'failed_but_paid',
        r.id,
        p.id,
        `payment 状态 ${p.payoutStatus} 但报销单标 paid。Fluxa 后期 retry 成功未回写？或链上 reorg 让交易失败但应用层已确认？`,
      );
    }
  }

  // ── 2. succeeded_but_not_paid: payment 成功但 reimb 不是 paid
  for (const p of allPayments) {
    const r = reimbMap.get(p.reimbursementId);
    if (!r) continue;
    if (
      SUCCESS_PAYOUT_STATUSES.includes(p.payoutStatus as never) &&
      r.status !== 'paid'
    ) {
      pushAnomaly(
        'succeeded_but_not_paid',
        r.id,
        p.id,
        `payment 已成功 ${p.payoutStatus} 但报销单还是 ${r.status}。批量同步应该已经修过；如果还看到说明流程有别的卡点。`,
      );
    }
  }

  // ── 3. rejected_with_inflight: reimb 已 rejected 但 payment 还在途
  for (const p of allPayments) {
    const r = reimbMap.get(p.reimbursementId);
    if (!r) continue;
    if (
      r.status === 'rejected' &&
      IN_FLIGHT_PAYOUT_STATUSES.includes(p.payoutStatus as never)
    ) {
      pushAnomaly(
        'rejected_with_inflight',
        r.id,
        p.id,
        `报销已被驳回但 payment 还在途 (${p.payoutStatus})。应该联系 Fluxa 取消打款，或确认是否已实际打出。`,
      );
    }
  }

  // ── 4. paid_no_payment: reimb 是 paid 但完全没 payment 记录
  for (const r of allReimbs) {
    if (r.status !== 'paid') continue;
    const ps = paymentsByReimb.get(r.id) || [];
    if (ps.length === 0) {
      pushAnomaly(
        'paid_no_payment',
        r.id,
        null,
        `报销单标 paid 但没有任何 payment 记录。可能是系统外手动打款、早期版本数据，或迁移导致丢失。`,
      );
    }
  }

  // ── 5. multiple_succeeded: 一个 reimb 有多笔 succeeded payment
  for (const [reimbId, ps] of paymentsByReimb.entries()) {
    const succeeded = ps.filter(p =>
      SUCCESS_PAYOUT_STATUSES.includes(p.payoutStatus as never),
    );
    if (succeeded.length > 1) {
      // 用 reimbursementId 做 key（不挂在具体 payment 上）
      pushAnomaly(
        'multiple_succeeded',
        reimbId,
        null,
        `该报销单有 ${succeeded.length} 笔 succeeded payment，疑似重复打款。需要财务确认是否退回部分金额。`,
      );
    }
  }

  return anomalies;
}

/**
 * 把异常标记为已审核 / 接受 / 已修复。
 */
export async function reviewAnomaly(params: {
  tenantId: string;
  anomalyKey: string;
  status: 'reviewed' | 'accepted' | 'fixed';
  note: string;
  userId: string;
}): Promise<void> {
  const now = new Date();
  const [existing] = await db
    .select()
    .from(dataAnomalyReviews)
    .where(
      and(
        eq(dataAnomalyReviews.tenantId, params.tenantId),
        eq(dataAnomalyReviews.anomalyKey, params.anomalyKey),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(dataAnomalyReviews)
      .set({
        status: params.status,
        note: params.note || null,
        reviewedBy: params.userId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(dataAnomalyReviews.id, existing.id));
  } else {
    await db.insert(dataAnomalyReviews).values({
      tenantId: params.tenantId,
      anomalyKey: params.anomalyKey,
      status: params.status,
      note: params.note || null,
      reviewedBy: params.userId,
      reviewedAt: now,
    });
  }
}

/**
 * 把 reimbursement 从 paid 回滚到 approved（用于 failed_but_paid 异常）。
 * 同时清掉 paidAt。审计日志通过 anomaly review 备注承载。
 */
export async function rollbackReimbursementToApproved(params: {
  tenantId: string;
  reimbursementId: string;
}): Promise<{ updated: boolean }> {
  const result = await db
    .update(reimbursements)
    .set({
      status: 'approved',
      paidAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reimbursements.id, params.reimbursementId),
        eq(reimbursements.tenantId, params.tenantId),
        eq(reimbursements.status, 'paid'),
      ),
    )
    .returning({ id: reimbursements.id });
  return { updated: result.length > 0 };
}

/**
 * 强制把 reimbursement 标 paid（用于 succeeded_but_not_paid 异常的手工修复）。
 */
export async function forceMarkReimbursementPaid(params: {
  tenantId: string;
  reimbursementId: string;
  paidAt?: Date;
}): Promise<{ updated: boolean }> {
  const result = await db
    .update(reimbursements)
    .set({
      status: 'paid',
      paidAt: params.paidAt || new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reimbursements.id, params.reimbursementId),
        eq(reimbursements.tenantId, params.tenantId),
        sql`status != 'paid'`,
      ),
    )
    .returning({ id: reimbursements.id });
  return { updated: result.length > 0 };
}
