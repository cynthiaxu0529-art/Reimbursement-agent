/**
 * 三级 fallback 匹配：把 Fluxa CSV 的转账行匹配到系统的 payments 记录。
 *
 * 优先级：
 *   ① txHash 完全相等        → high confidence  / matched_by='tx_hash'
 *   ② payoutId 相等          → high confidence  / matched_by='payout_id'
 *   ③ (toAddress, amount±容差, paidAt±时间窗口) → low  / matched_by='fuzzy'
 *
 * 第 ③ 级匹配上的会以 low_confidence_match 类型入差异表，财务必须确认。
 *
 * 没匹配上的：
 *   - payments 没有对应 csv 行 → system_only
 *   - csv 行没有对应 payment   → chain_only
 *
 * 匹配上后还会再校验：
 *   - 金额超容差 → amount_mismatch
 *   - to 地址不一致 → address_mismatch
 *   - 一个 payment 配到多笔 csv → duplicate_payment
 */

import type { FluxaCsvRow } from './csv-parser';

export interface ToleranceConfig {
  /** 同币种绝对容差，默认 0.01 */
  sameCurrencyAbs: number;
  /** 跨币种相对容差（小数），默认 0.005 = 0.5% */
  crossCurrencyRel: number;
  /** 时间匹配窗口，单位毫秒，默认 2h */
  timeWindowMs: number;
  /** gas 是否计入金额差异，默认 false */
  countGasInDiff: boolean;
}

export const DEFAULT_TOLERANCE: ToleranceConfig = {
  sameCurrencyAbs: 0.01,
  crossCurrencyRel: 0.005,
  timeWindowMs: 2 * 60 * 60 * 1000,
  countGasInDiff: false,
};

export interface PaymentRecord {
  id: string;
  reimbursementId: string;
  payoutId: string | null;
  txHash: string | null;
  toAddress: string | null;
  amount: number;
  currency: string;
  paidAt: Date | null;
  payoutStatus: string | null;
}

export type DiscrepancyType =
  | 'system_only'
  | 'chain_only'
  | 'amount_mismatch'
  | 'address_mismatch'
  | 'duplicate_payment'
  | 'low_confidence_match';

export interface Discrepancy {
  type: DiscrepancyType;
  paymentId?: string;
  csvRowIndex?: number;
  csvRowSnapshot?: FluxaCsvRow;
  matchedBy?: 'tx_hash' | 'payout_id' | 'fuzzy';
  matchConfidence?: 'high' | 'medium' | 'low';
  details: Record<string, unknown>;
}

export interface MatchResult {
  matchedCount: number;
  matchedAmount: number;
  csvTotalAmount: number;
  discrepancies: Discrepancy[];
}

/**
 * 把字符串标准化用于比较（trim + lowercase）。
 * 链上地址做大小写不敏感比较（EVM checksum 大小写差异常见）。
 */
function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

function amountWithinTolerance(
  a: number,
  b: number,
  sameCurrency: boolean,
  cfg: ToleranceConfig,
): boolean {
  const diff = Math.abs(a - b);
  if (sameCurrency) return diff <= cfg.sameCurrencyAbs;
  const base = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return diff / base <= cfg.crossCurrencyRel;
}

function effectiveCsvAmount(row: FluxaCsvRow, cfg: ToleranceConfig): number {
  // gas 默认不计入差异：把 csv 上 amount + gasFee 视为 payment 应该报的金额
  // 也就是说 payment.amount 应等于 csv.amount（不含 gas），公司额外承担 gas
  if (cfg.countGasInDiff && row.gasFee !== undefined) {
    return row.amount + row.gasFee;
  }
  return row.amount;
}

export function matchPaymentsAgainstCsv(
  payments: PaymentRecord[],
  csvRows: FluxaCsvRow[],
  toleranceParam: Partial<ToleranceConfig> = {},
): MatchResult {
  const cfg: ToleranceConfig = { ...DEFAULT_TOLERANCE, ...toleranceParam };

  // ── 索引：csv 行按 txHash / payoutId 建反查表
  const csvByTxHash = new Map<string, number[]>(); // hash -> indices
  const csvByPayoutId = new Map<string, number[]>();
  for (let i = 0; i < csvRows.length; i++) {
    const row = csvRows[i];
    const h = norm(row.txHash);
    if (h) {
      if (!csvByTxHash.has(h)) csvByTxHash.set(h, []);
      csvByTxHash.get(h)!.push(i);
    }
    const p = norm(row.payoutId);
    if (p) {
      if (!csvByPayoutId.has(p)) csvByPayoutId.set(p, []);
      csvByPayoutId.get(p)!.push(i);
    }
  }

  // ── 状态：哪些 csv 行已被消费、哪些 payment 已被匹配
  const csvConsumed = new Array(csvRows.length).fill(false);
  const paymentMatched = new Map<string, { csvIdx: number; matchedBy: 'tx_hash' | 'payout_id' | 'fuzzy' }[]>();

  function recordMatch(paymentId: string, csvIdx: number, by: 'tx_hash' | 'payout_id' | 'fuzzy') {
    if (!paymentMatched.has(paymentId)) paymentMatched.set(paymentId, []);
    paymentMatched.get(paymentId)!.push({ csvIdx, matchedBy: by });
    csvConsumed[csvIdx] = true;
  }

  const discrepancies: Discrepancy[] = [];

  // ── ① txHash 精确匹配
  for (const p of payments) {
    if (!p.txHash) continue;
    const hits = csvByTxHash.get(norm(p.txHash));
    if (!hits || hits.length === 0) continue;
    for (const idx of hits) {
      if (!csvConsumed[idx]) {
        recordMatch(p.id, idx, 'tx_hash');
        break; // 一个 payment 在 ① 级只配一笔；多笔走 duplicate_payment 检测
      }
    }
  }

  // ── ② payoutId 匹配（只对还没匹配上的 payment）
  for (const p of payments) {
    if (paymentMatched.has(p.id)) continue;
    if (!p.payoutId) continue;
    const hits = csvByPayoutId.get(norm(p.payoutId));
    if (!hits || hits.length === 0) continue;
    for (const idx of hits) {
      if (!csvConsumed[idx]) {
        recordMatch(p.id, idx, 'payout_id');
        break;
      }
    }
  }

  // ── ③ 模糊匹配：(toAddress, amount±容差, paidAt±时间窗口)
  for (const p of payments) {
    if (paymentMatched.has(p.id)) continue;
    if (!p.toAddress || p.paidAt === null) continue;
    const pAddr = norm(p.toAddress);
    const pTime = p.paidAt.getTime();
    for (let idx = 0; idx < csvRows.length; idx++) {
      if (csvConsumed[idx]) continue;
      const row = csvRows[idx];
      if (norm(row.toAddress) !== pAddr) continue;
      const csvAmount = effectiveCsvAmount(row, cfg);
      const sameCcy = norm(row.token) === norm(p.currency);
      if (!amountWithinTolerance(csvAmount, p.amount, sameCcy, cfg)) continue;
      const csvTime = new Date(row.timestamp).getTime();
      if (Number.isNaN(csvTime)) continue;
      if (Math.abs(csvTime - pTime) > cfg.timeWindowMs) continue;
      recordMatch(p.id, idx, 'fuzzy');
      break;
    }
  }

  // ── 校验：金额 / 地址 / 重复
  let matchedCount = 0;
  let matchedAmount = 0;

  for (const p of payments) {
    const matches = paymentMatched.get(p.id);
    if (!matches || matches.length === 0) {
      // payment 没匹配上 → system_only
      discrepancies.push({
        type: 'system_only',
        paymentId: p.id,
        details: {
          paymentAmount: p.amount,
          paymentCurrency: p.currency,
          paidAt: p.paidAt?.toISOString(),
          payoutStatus: p.payoutStatus,
          message: '系统标记已支付，但 Fluxa 清单里找不到对应转账',
        },
      });
      continue;
    }

    matchedCount += 1;
    matchedAmount += p.amount;

    // 多笔 → duplicate_payment（除主匹配之外的全标）
    if (matches.length > 1) {
      for (let i = 1; i < matches.length; i++) {
        discrepancies.push({
          type: 'duplicate_payment',
          paymentId: p.id,
          csvRowIndex: matches[i].csvIdx,
          csvRowSnapshot: csvRows[matches[i].csvIdx],
          matchedBy: matches[i].matchedBy,
          matchConfidence: 'medium',
          details: {
            message: '同一报销 payment 在链上清单出现了多笔转账',
            primaryMatchCsvIndex: matches[0].csvIdx,
          },
        });
      }
    }

    const primary = matches[0];
    const row = csvRows[primary.csvIdx];

    // 模糊匹配先标 low_confidence_match；金额/地址校验失败再补差异
    if (primary.matchedBy === 'fuzzy') {
      discrepancies.push({
        type: 'low_confidence_match',
        paymentId: p.id,
        csvRowIndex: primary.csvIdx,
        csvRowSnapshot: row,
        matchedBy: 'fuzzy',
        matchConfidence: 'low',
        details: {
          message: '仅靠 (地址 + 金额 + 时间窗) 模糊匹配，需要财务人工确认',
          paymentAmount: p.amount,
          csvAmount: row.amount,
          paymentCurrency: p.currency,
          csvToken: row.token,
        },
      });
    }

    // 地址不符（只有非 fuzzy 才会触发，因为 fuzzy 本来就要求地址相等）
    if (primary.matchedBy !== 'fuzzy' && p.toAddress && norm(row.toAddress) !== norm(p.toAddress)) {
      discrepancies.push({
        type: 'address_mismatch',
        paymentId: p.id,
        csvRowIndex: primary.csvIdx,
        csvRowSnapshot: row,
        matchedBy: primary.matchedBy,
        matchConfidence: primary.matchedBy === 'tx_hash' ? 'high' : 'medium',
        details: {
          paymentToAddress: p.toAddress,
          csvToAddress: row.toAddress,
        },
      });
    }

    // 金额差超容差
    const csvAmount = effectiveCsvAmount(row, cfg);
    const sameCcy = norm(row.token) === norm(p.currency);
    if (!amountWithinTolerance(csvAmount, p.amount, sameCcy, cfg)) {
      discrepancies.push({
        type: 'amount_mismatch',
        paymentId: p.id,
        csvRowIndex: primary.csvIdx,
        csvRowSnapshot: row,
        matchedBy: primary.matchedBy,
        matchConfidence: primary.matchedBy === 'tx_hash' ? 'high' : primary.matchedBy === 'payout_id' ? 'high' : 'low',
        details: {
          paymentAmount: p.amount,
          paymentCurrency: p.currency,
          csvAmount: row.amount,
          csvToken: row.token,
          gasFee: row.gasFee,
          countedGas: cfg.countGasInDiff,
          delta: csvAmount - p.amount,
        },
      });
    }
  }

  // ── 没被消费的 csv 行 → chain_only
  let csvTotalAmount = 0;
  for (let i = 0; i < csvRows.length; i++) {
    csvTotalAmount += csvRows[i].amount;
    if (!csvConsumed[i]) {
      discrepancies.push({
        type: 'chain_only',
        csvRowIndex: i,
        csvRowSnapshot: csvRows[i],
        details: {
          message: 'Fluxa 清单里有这笔转账，但系统找不到对应的 payment 记录',
        },
      });
    }
  }

  return {
    matchedCount,
    matchedAmount,
    csvTotalAmount,
    discrepancies,
  };
}
