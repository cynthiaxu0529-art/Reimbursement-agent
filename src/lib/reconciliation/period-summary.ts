/**
 * 按期对账（汇总粒度）
 *
 * 拿一份 wallet_reconciliations 的 raw_rows，按月聚合"钱包实付总额"，
 * 再去本租户的 payments 表算"系统记账总额"（同样按月），出每个月的差异。
 *
 * 跟现有的 payment 粒度对账（reconciliation_discrepancies）互补：
 *   - payment 粒度 = 每行 CSV vs 每条 payment 一一配对
 *   - 按期对账 = 每个月两边总额对比
 *
 * 用户原话："感觉有的是发票金额，而不是按照实际支付的报销金额去汇总，
 *           会导致报表里面钱包余额对不上，入账费用金额也出错"
 *
 * 这就是为了 surface 这种口径偏差：系统月度报销入账 ≠ 钱包月度实付。
 */

import { db } from '@/lib/db';
import {
  payments,
  reimbursements,
  reimbursementItems,
} from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import type { FluxaCsvRow } from './csv-parser';

export interface PeriodSummary {
  /** 'YYYY-MM' */
  periodId: string;
  /** 钱包 CSV 该月 confirmed/succeeded 出账总额 */
  walletOutflowTotal: number;
  /** 钱包 CSV 该月 confirmed/succeeded 出账笔数 */
  walletOutflowCount: number;
  /** 系统 payments 该月 succeeded fluxa payment 总额（按 paid_at 归月）*/
  systemPaymentsTotal: number;
  systemPaymentsCount: number;
  /** 系统 reimbursement_items 该月（按 item.date）入账总额（base currency）*/
  systemBookedTotal: number;
  systemBookedCount: number;
  /** wallet - system_payments 差 */
  diffPayments: number;
  /** wallet - system_booked 差（这个才是用户最关心的——记账口径 vs 实付口径）*/
  diffBooked: number;
  /** 钱包有但系统找不到对应 payment 的 CSV 行索引 */
  walletOnlyRowIndexes: number[];
  /** 系统 succeeded payment 但 CSV 找不到的 payment IDs */
  systemOnlyPaymentIds: string[];
}

export interface PeriodSummaryWithReview extends PeriodSummary {
  reviewStatus: 'unreviewed' | 'reviewed' | 'accepted';
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

function monthIdOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

/**
 * 计算按期对账总览。
 *
 * @param tenantId 当前租户
 * @param csvRows  Fluxa CSV 已过滤行（只含 confirmed/succeeded outflow payouts）
 */
export async function computePeriodSummary(
  tenantId: string,
  csvRows: FluxaCsvRow[],
): Promise<PeriodSummary[]> {
  // ── 1. 按月聚合 CSV
  const csvByMonth = new Map<string, { rows: number[]; total: number }>();
  const csvByPayoutId = new Map<string, number>();  // payoutId → row index
  const csvByTxHash = new Map<string, number>();
  for (let i = 0; i < csvRows.length; i++) {
    const row = csvRows[i];
    const d = new Date(row.timestamp);
    if (Number.isNaN(d.getTime())) continue;
    const monthId = monthIdOf(d);
    const bucket = csvByMonth.get(monthId) || { rows: [], total: 0 };
    bucket.rows.push(i);
    bucket.total += row.amount;
    csvByMonth.set(monthId, bucket);

    if (row.payoutId) csvByPayoutId.set(norm(row.payoutId), i);
    if (row.txHash) csvByTxHash.set(norm(row.txHash), i);
  }

  // ── 2. 拿出本租户所有 succeeded fluxa payments + 关联的 reimbursement
  const allPayments = await db
    .select({
      paymentId: payments.id,
      payoutId: payments.payoutId,
      txHash: payments.txHash,
      paidAt: payments.paidAt,
      amount: payments.amount,
      reimbursementId: payments.reimbursementId,
    })
    .from(payments)
    .innerJoin(reimbursements, eq(payments.reimbursementId, reimbursements.id))
    .where(
      and(
        eq(reimbursements.tenantId, tenantId),
        eq(payments.payoutStatus, 'succeeded'),
        eq(payments.paymentProvider, 'fluxa'),
      ),
    );

  // ── 3. 系统 payments 按月聚合（按 paid_at）
  const paymentsByMonth = new Map<string, { paymentIds: string[]; total: number }>();
  for (const p of allPayments) {
    if (!p.paidAt) continue;
    const monthId = monthIdOf(p.paidAt);
    const bucket = paymentsByMonth.get(monthId) || { paymentIds: [], total: 0 };
    bucket.paymentIds.push(p.paymentId);
    bucket.total += p.amount;
    paymentsByMonth.set(monthId, bucket);
  }

  // ── 4. 系统 reimbursement_items 按月聚合（按 item.date，本位币金额）
  //     注意：这是"应该入账"的金额——即财务报表里看到的费用金额
  //     如果 paid_amount.ts 的 scaling 已经生效，这里读的就是 scaled 后的；
  //     如果没生效，这里读的是 invoice amount——正是用户怀疑的"汇总用发票金额"
  const reimbIds = allPayments.map(p => p.reimbursementId);
  const uniqueReimbIds = Array.from(new Set(reimbIds));
  const allItems = uniqueReimbIds.length > 0
    ? await db
        .select({
          itemId: reimbursementItems.id,
          date: reimbursementItems.date,
          amountInBaseCurrency: reimbursementItems.amountInBaseCurrency,
          amount: reimbursementItems.amount,
        })
        .from(reimbursementItems)
        .where(inArray(reimbursementItems.reimbursementId, uniqueReimbIds))
    : [];

  const bookedByMonth = new Map<string, { itemIds: string[]; total: number }>();
  for (const it of allItems) {
    if (!it.date) continue;
    const monthId = monthIdOf(it.date);
    const bucket = bookedByMonth.get(monthId) || { itemIds: [], total: 0 };
    bucket.itemIds.push(it.itemId);
    bucket.total += Number(it.amountInBaseCurrency || it.amount || 0);
    bookedByMonth.set(monthId, bucket);
  }

  // ── 5. 找出 walletOnly + systemOnly per month
  //     walletOnly：CSV 行的 payoutId 在 payments 表里找不到对应记录
  //     systemOnly：payments 记录的 payoutId/txHash 在 CSV 里找不到
  const allPaymentsByPayoutId = new Map<string, typeof allPayments[number]>();
  const allPaymentsByTxHash = new Map<string, typeof allPayments[number]>();
  for (const p of allPayments) {
    if (p.payoutId) allPaymentsByPayoutId.set(norm(p.payoutId), p);
    if (p.txHash) allPaymentsByTxHash.set(norm(p.txHash), p);
  }

  const matchedPaymentIds = new Set<string>();
  const walletOnlyByMonth = new Map<string, number[]>();
  for (let i = 0; i < csvRows.length; i++) {
    const row = csvRows[i];
    const d = new Date(row.timestamp);
    if (Number.isNaN(d.getTime())) continue;
    const monthId = monthIdOf(d);

    let matched: typeof allPayments[number] | undefined;
    if (row.txHash) matched = allPaymentsByTxHash.get(norm(row.txHash));
    if (!matched && row.payoutId) matched = allPaymentsByPayoutId.get(norm(row.payoutId));

    if (matched) {
      matchedPaymentIds.add(matched.paymentId);
    } else {
      const arr = walletOnlyByMonth.get(monthId) || [];
      arr.push(i);
      walletOnlyByMonth.set(monthId, arr);
    }
  }

  const systemOnlyByMonth = new Map<string, string[]>();
  for (const p of allPayments) {
    if (matchedPaymentIds.has(p.paymentId)) continue;
    if (!p.paidAt) continue;
    const monthId = monthIdOf(p.paidAt);
    const arr = systemOnlyByMonth.get(monthId) || [];
    arr.push(p.paymentId);
    systemOnlyByMonth.set(monthId, arr);
  }

  // ── 6. 组装 per-month 结果
  // 月份取并集：CSV 覆盖 + payments 覆盖 + items 覆盖
  const allMonths = new Set<string>([
    ...csvByMonth.keys(),
    ...paymentsByMonth.keys(),
    ...bookedByMonth.keys(),
  ]);

  const periods: PeriodSummary[] = [];
  for (const periodId of Array.from(allMonths).sort()) {
    const wallet = csvByMonth.get(periodId);
    const sysPayments = paymentsByMonth.get(periodId);
    const sysBooked = bookedByMonth.get(periodId);

    const walletOutflowTotal = round(wallet?.total || 0);
    const systemPaymentsTotal = round(sysPayments?.total || 0);
    const systemBookedTotal = round(sysBooked?.total || 0);

    periods.push({
      periodId,
      walletOutflowTotal,
      walletOutflowCount: wallet?.rows.length || 0,
      systemPaymentsTotal,
      systemPaymentsCount: sysPayments?.paymentIds.length || 0,
      systemBookedTotal,
      systemBookedCount: sysBooked?.itemIds.length || 0,
      diffPayments: round(walletOutflowTotal - systemPaymentsTotal),
      diffBooked: round(walletOutflowTotal - systemBookedTotal),
      walletOnlyRowIndexes: walletOnlyByMonth.get(periodId) || [],
      systemOnlyPaymentIds: systemOnlyByMonth.get(periodId) || [],
    });
  }

  return periods;
}

function round(n: number, decimals = 2): number {
  return Number(n.toFixed(decimals));
}
