/**
 * Aggregate the **actually paid** amount per reimbursement so accounting
 * summaries reflect what the company really spent — not the original
 * receipt amount.
 *
 * Background:
 *   Reimbursements are sometimes capped under company expense policies
 *   (e.g. AI subscriptions ≤ $100 / month). When that happens, the row in
 *   `reimbursement_items` keeps the original receipt amount (e.g. $107.31)
 *   but `payments.amount` records the actual payout ($100). Booking the
 *   receipt amount on the GL would over-state expense by $7.31; the
 *   employee absorbs the cap, never the company.
 *
 *   Both /api/reimbursement-summaries and /api/internal/accounting-summaries
 *   used to aggregate by `item.amountInBaseCurrency` only. This helper lets
 *   them adjust to actually-paid amounts for any `reimbursement.status =
 *   'paid'` row.
 */

import { db } from '@/lib/db';
import { payments } from '@/lib/db/schema';
import { inArray, and } from 'drizzle-orm';

/**
 * Payment statuses that represent a confirmed outflow of cash. We count
 * these against the reimbursement's "actually paid" total. Other statuses
 * (`pending`, `pending_authorization`, `authorized`, …) are in-flight and
 * not yet a real expense; `failed` / `expired` / `cancelled` are dead.
 */
const SETTLED_PAYMENT_STATUSES = ['paid', 'succeeded'] as const;

export interface PaidAmountSummary {
  /** Reimbursement IDs that have at least one settled payment. */
  paidByReimbursement: Map<string, number>;
}

/**
 * Batch-query `payments` for the given reimbursement IDs and return a
 * { reimbursementId → sumOfSettledPayments } map. Currency assumption is
 * that `payments.amount` is denominated in the same base currency the
 * summaries aggregate in (USD/USDC for the typical tenant — see
 * /api/payments/process which always stores `amountUSD`).
 */
export async function fetchPaidAmounts(
  reimbursementIds: string[],
): Promise<PaidAmountSummary> {
  const paidByReimbursement = new Map<string, number>();
  if (reimbursementIds.length === 0) {
    return { paidByReimbursement };
  }

  const rows = await db
    .select({
      reimbursementId: payments.reimbursementId,
      amount: payments.amount,
      status: payments.status,
    })
    .from(payments)
    .where(
      and(
        inArray(payments.reimbursementId, reimbursementIds),
        inArray(payments.status, SETTLED_PAYMENT_STATUSES as unknown as string[]),
      ),
    );

  for (const row of rows) {
    const prev = paidByReimbursement.get(row.reimbursementId) ?? 0;
    paidByReimbursement.set(row.reimbursementId, prev + Number(row.amount));
  }

  return { paidByReimbursement };
}

/**
 * For one reimbursement, compute the per-item scale factor that adjusts
 * receipt amounts down to what was actually paid. Returns `null` when no
 * scaling is needed (no settled payments yet, or paid total ≥ receipt total).
 *
 * Pro-rata distribution preserves item-level granularity while making the
 * group total match `payments.amount`.
 */
export function paidScaleFactor(
  paidTotal: number | undefined,
  receiptTotal: number,
): number | null {
  if (!paidTotal || paidTotal <= 0) return null;
  if (receiptTotal <= 0) return null;
  // tiny tolerance — float math on 2-decimal amounts
  if (paidTotal >= receiptTotal - 0.005) return null;
  return paidTotal / receiptTotal;
}
