/**
 * Offline test for the paid-amount pro-rata scaling math used by the
 * accounting summaries. No DB / no network. Pure math.
 *
 * Reproduces the user's reported case:
 *   - 5 monthly Claude Max Plan items, 4 of them billed $107.31, 1 billed $99.11
 *   - Each is its own reimbursement; company policy caps the payout at $100
 *   - For the 4 capped months, payments.amount = $100; for Nov ($99.11),
 *     payments.amount = $99.11 (no cap triggered).
 *
 * Asserts that:
 *   - Capped months book $100 in the summary (not $107.31)
 *   - Non-capped Nov stays $99.11
 *   - receipt_amount field is set only when scaling actually happened
 *
 * Run: npx tsx scripts/validate-paid-amount-scaling.ts
 */

import { paidScaleFactor } from '../src/lib/accounting/paid-amount';

interface Case {
  name: string;
  receipt: number;
  paid: number | undefined;
  expectBookedAmount: number;
  expectScaled: boolean;
}

const CASES: Case[] = [
  // The user's screenshot
  { name: 'Claude Max - Nov ($99.11 receipt, $99.11 paid)', receipt: 99.11,  paid: 99.11, expectBookedAmount: 99.11, expectScaled: false },
  { name: 'Claude Max - Dec ($107.31 receipt, $100 cap)',   receipt: 107.31, paid: 100.00, expectBookedAmount: 100.00, expectScaled: true  },
  { name: 'Claude Max - Jan ($107.31 receipt, $100 cap)',   receipt: 107.31, paid: 100.00, expectBookedAmount: 100.00, expectScaled: true  },
  { name: 'Claude Max - Feb ($107.31 receipt, $100 cap)',   receipt: 107.31, paid: 100.00, expectBookedAmount: 100.00, expectScaled: true  },
  { name: 'Claude Max - Mar ($107.31 receipt, $100 cap)',   receipt: 107.31, paid: 100.00, expectBookedAmount: 100.00, expectScaled: true  },
  // Approved but not yet paid → no scaling
  { name: 'Approved-not-paid: receipt $200, paid undefined', receipt: 200,    paid: undefined, expectBookedAmount: 200, expectScaled: false },
  // Pay equals receipt (no cap) → no scaling
  { name: 'Receipt $50 fully paid $50',                      receipt: 50,     paid: 50,    expectBookedAmount: 50, expectScaled: false },
  // Tiny float drift below tolerance → no scaling
  { name: 'Float drift: receipt 100.00, paid 99.999',        receipt: 100.00, paid: 99.999, expectBookedAmount: 100.00, expectScaled: false },
];

let passed = 0;
let failed = 0;

for (const tc of CASES) {
  const factor = paidScaleFactor(tc.paid, tc.receipt);
  const scaled = factor !== null;
  const booked = scaled ? tc.receipt * factor! : tc.receipt;
  const bookedRounded = Number(booked.toFixed(2));

  const ok = bookedRounded === tc.expectBookedAmount && scaled === tc.expectScaled;
  const icon = ok ? '✓' : '✗';
  console.log(
    `  ${icon} ${tc.name.padEnd(50)} → booked=${bookedRounded.toFixed(2).padStart(7)} scaled=${scaled}` +
      (ok ? '' : `  [expected booked=${tc.expectBookedAmount} scaled=${tc.expectScaled}]`),
  );

  if (ok) passed++; else failed++;
}

console.log('');
console.log(`[paid-amount] ${passed}/${CASES.length} passed, ${failed} failed`);
if (failed > 0) {
  console.error('[paid-amount] Math is wrong; do NOT ship until green.');
  process.exit(1);
}
console.log('[paid-amount] Pro-rata scaling produces the right booked amount in every scenario.');
process.exit(0);
