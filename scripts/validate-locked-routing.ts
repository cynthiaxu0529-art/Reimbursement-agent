/**
 * Verify that contract-locked expense types ignore cost center.
 *
 * The integration guide Mapping conventions sections #1–#5 require certain
 * expense types to route to a single canonical GL account regardless of
 * which department's employee paid. After the EXPENSE_TYPE_ACCOUNTS rework
 * in this PR, the table should produce the SAME code across rd / sm / ga
 * for these types.
 *
 * Run: npx tsx scripts/validate-locked-routing.ts
 */

import { EXPENSE_TYPE_ACCOUNTS, type ExpenseType, type ExpenseFunction } from '../src/lib/accounting/account-rules';

interface Spec {
  type: ExpenseType;
  expectCode: string;
  rationale: string;
}

const LOCKED: Spec[] = [
  { type: 'company_saas',      expectCode: '6350', rationale: 'Mapping conventions #1 — company-wide SaaS → G&A regardless of payer' },
  { type: 'web3_rpc',          expectCode: '6425', rationale: 'Mapping conventions #2 — Web3 consumption RPC / nodes / indexers' },
  { type: 'web3_subscription', expectCode: '6430', rationale: 'Mapping conventions #2 — Web3 SDK / hosted auth / subscription' },
  { type: 'gpu_compute',       expectCode: '6420', rationale: 'Mapping conventions #3 — GPU rental → R&D Cloud & Infra' },
  { type: 'ai_api',            expectCode: '6435', rationale: 'Mapping conventions #4 — LLM / AI APIs → R&D AI & API Services' },
  { type: 'kol_marketing',     expectCode: '6125', rationale: 'Mapping conventions #5 — KOL / influencer fees' },
  { type: 'community_rewards', expectCode: '6145', rationale: 'Mapping conventions #5 — red packets / airdrops / referrals' },
  { type: 'advertising',       expectCode: '6120', rationale: 'Mapping conventions #5 — paid ads (Google / Meta / LinkedIn)' },
  { type: 'content_seo',       expectCode: '6130', rationale: 'Mapping conventions #5 — content / SEO are S&M spend' },
  { type: 'pr_communications', expectCode: '6160', rationale: 'Mapping conventions #5 — PR agency / press releases' },
];

const SPLIT: ExpenseType[] = [
  'travel',
  'meals',
  'office_supplies',
  'training',
  'shipping',
  'telecom',
  'insurance',
  'cloud',
  'software',
  'miscellaneous',
];

const FUNCTIONS: ExpenseFunction[] = ['rd', 'sm', 'ga'];

let passed = 0;
let failed = 0;

console.log('--- Locked types (rd / sm / ga must be the same) ---');
for (const spec of LOCKED) {
  const codes = EXPENSE_TYPE_ACCOUNTS[spec.type];
  const allSame = codes.rd === spec.expectCode && codes.sm === spec.expectCode && codes.ga === spec.expectCode;
  const icon = allSame ? '✓' : '✗';
  console.log(
    `  ${icon} ${spec.type.padEnd(20)} expect ${spec.expectCode}  got rd=${codes.rd} sm=${codes.sm} ga=${codes.ga}` +
      (allSame ? '' : `  [${spec.rationale}]`),
  );
  if (allSame) passed++; else failed++;
}

console.log('');
console.log('--- Split types (rd / sm / ga must differ — general expenses) ---');
for (const t of SPLIT) {
  const codes = EXPENSE_TYPE_ACCOUNTS[t];
  // We don't enforce a strict rule, but we expect at least some variation
  const distinct = new Set([codes.rd, codes.sm, codes.ga]).size;
  const icon = distinct > 1 ? '✓' : '?';
  console.log(`  ${icon} ${t.padEnd(20)} rd=${codes.rd} sm=${codes.sm} ga=${codes.ga}  (${distinct} distinct)`);
  if (distinct > 1) passed++; else failed++;
}

console.log('');
console.log(`[locked-routing] ${passed} passed / ${failed} failed`);
if (failed > 0) {
  console.error('[locked-routing] Routing table out of sync with contract.');
  process.exit(1);
}
console.log('[locked-routing] EXPENSE_TYPE_ACCOUNTS aligned with integration guide Mapping conventions.');
process.exit(0);
