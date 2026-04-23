/**
 * Offline Chart-of-Accounts mapping dry-run.
 *
 * Does NOT hit Postgres and does NOT call the Accounting Agent.  Uses the
 * in-tree FALLBACK_ACCOUNTS (aligned with the canonical CoA from the
 * integration guide) as the "known" CoA set, then runs every Mapping
 * conventions case through the mapper and asserts each resulting code is
 * in the canonical list.
 *
 * Usage:
 *   npx tsx scripts/validate-coa-mapping-offline.ts
 *
 * Useful when you just want to verify the mapping rules without setting up a
 * Postgres connection or pulling a service-account key.  Pair with the online
 * `validate-coa-emission.ts` once your env is wired up.
 */

import { FALLBACK_ACCOUNTS } from '../src/lib/accounting/chart-of-accounts-sync';
import { mapExpenseWithAccountNameResolver } from '../src/lib/accounting/expense-account-mapping';

interface Case {
  name: string;
  category: string;
  description: string;
  costCenter: 'rd' | 'sm' | 'ga';
  expectCode: string;
}

const CASES: Case[] = [
  // Company-wide SaaS → 6350 regardless of function ("who uses", not "who paid")
  { name: 'Notion paid by R&D engineer',        category: 'company_saas', description: 'Notion team plan',            costCenter: 'rd', expectCode: '6350' },
  { name: 'Slack paid by sales rep',            category: 'company_saas', description: 'Slack Pro',                   costCenter: 'sm', expectCode: '6350' },
  { name: 'Zoom paid by ops lead',              category: 'company_saas', description: 'Zoom Business',               costCenter: 'ga', expectCode: '6350' },
  { name: '1Password family plan',              category: 'company_saas', description: '1Password Business',          costCenter: 'rd', expectCode: '6350' },
  { name: 'Google Workspace renewal',           category: 'company_saas', description: 'Google Workspace',            costCenter: 'ga', expectCode: '6350' },

  // Web3 RPC / nodes / indexers → 6425
  { name: 'Alchemy RPC credits',                category: 'web3_rpc',       description: 'Alchemy monthly rpc usage',   costCenter: 'rd', expectCode: '6425' },
  { name: 'Infura node billing',                category: 'cloud_resource', description: 'Infura metered billing',      costCenter: 'rd', expectCode: '6425' },
  { name: 'QuickNode indexers',                 category: 'cloud_resource', description: 'QuickNode rpc',               costCenter: 'rd', expectCode: '6425' },
  { name: 'ZAN on-chain indexer',               category: 'cloud_resource', description: 'zan.top indexer',             costCenter: 'rd', expectCode: '6425' },

  // Web3 SDK / subscription → 6430
  { name: 'Privy hosted auth',                  category: 'web3_subscription', description: 'privy.io monthly plan',        costCenter: 'rd', expectCode: '6430' },
  { name: 'Dynamic wallet SDK',                 category: 'web3_subscription', description: 'dynamic.xyz sdk subscription', costCenter: 'rd', expectCode: '6430' },

  // GPU / ML compute → 6420
  { name: 'Runpod GPU rental',                  category: 'gpu_compute',    description: 'Runpod A100 rental',          costCenter: 'rd', expectCode: '6420' },
  { name: 'Lambda Labs H100',                   category: 'cloud_resource', description: 'Lambda Labs H100 hours',      costCenter: 'rd', expectCode: '6420' },
  { name: 'Vast.ai spot GPU',                   category: 'cloud_resource', description: 'vast.ai spot',                costCenter: 'rd', expectCode: '6420' },

  // AI / LLM APIs → 6435
  { name: 'OpenAI API usage',                   category: 'ai_api',   description: 'OpenAI monthly',                    costCenter: 'rd', expectCode: '6435' },
  { name: 'Anthropic API usage',                category: 'ai_token', description: 'Anthropic Claude API',              costCenter: 'rd', expectCode: '6435' },
  { name: 'OpenRouter proxy',                   category: 'ai_token', description: 'OpenRouter usage',                  costCenter: 'rd', expectCode: '6435' },
  { name: 'Firecrawl crawler API',              category: 'ai_api',   description: 'Firecrawl extract API',             costCenter: 'rd', expectCode: '6435' },

  // S&M KOL → 6125 (NOT 6120 advertising)
  { name: 'KOL influencer fee',                 category: 'kol',       description: 'KOL 小红书达人推广',                costCenter: 'sm', expectCode: '6125' },
  { name: 'KOC sponsored post',                 category: 'marketing', description: 'KOC creator collaboration',        costCenter: 'sm', expectCode: '6125' },

  // S&M red packet / community rewards → 6145
  { name: 'User onboarding red packets',        category: 'red_packet', description: '运营红包用户激励',                  costCenter: 'sm', expectCode: '6145' },
  { name: 'Airdrop to community',               category: 'marketing',  description: 'airdrop 空投奖励',                   costCenter: 'sm', expectCode: '6145' },
  { name: 'Referral bonus payout',              category: 'marketing',  description: '邀请奖励 referral bonus',            costCenter: 'sm', expectCode: '6145' },

  // Paid ads → 6120
  { name: 'Google Ads paid spend',              category: 'marketing', description: 'Google Ads budget',               costCenter: 'sm', expectCode: '6120' },

  // Baseline travel / meal / office
  { name: 'Hotel in R&D trip',                  category: 'hotel',           description: '差旅住宿',                       costCenter: 'rd', expectCode: '6440' },
  { name: 'Team lunch',                         category: 'meal',            description: '午餐',                           costCenter: 'rd', expectCode: '6450' },
  { name: 'R&D office supplies',                category: 'office_supplies', description: '办公用品',                       costCenter: 'rd', expectCode: '6410' },
];

async function main() {
  // In-memory CoA = FALLBACK_ACCOUNTS (aligned with contract canonical list).
  const known = new Set(FALLBACK_ACCOUNTS.map((a) => a.account_code));
  const nameByCode = new Map(FALLBACK_ACCOUNTS.map((a) => [a.account_code, a.account_name]));

  const isKnown = async (code: string) => known.has(code);
  const resolveName = async (code: string, fallback: string) => nameByCode.get(code) || fallback;

  console.log(`[offline] Canonical CoA loaded from FALLBACK_ACCOUNTS: ${known.size} codes`);
  console.log('');

  let passed = 0;
  let mismatches = 0;
  let missing = 0;

  for (const tc of CASES) {
    const res = await mapExpenseWithAccountNameResolver(
      tc.category,
      tc.description,
      tc.costCenter,
      tc.costCenter === 'rd' ? 'R&D' : tc.costCenter === 'sm' ? 'Marketing' : 'Operations',
      resolveName,
      isKnown,
    );

    const inCoA = known.has(res.accountCode);
    const codeMatch = res.accountCode === tc.expectCode;
    const icon = codeMatch && inCoA ? '✓' : '✗';

    console.log(
      `  ${icon} ${tc.name.padEnd(40)} → ${res.accountCode} ${res.accountName}` +
        (codeMatch ? '' : `   [expected ${tc.expectCode}]`) +
        (inCoA ? '' : '   [NOT IN CoA]'),
    );

    if (codeMatch && inCoA) passed++;
    if (!codeMatch) mismatches++;
    if (!inCoA) missing++;
  }

  console.log('');
  console.log(
    `[offline] Summary: ${passed}/${CASES.length} passed, ${mismatches} mismatched, ${missing} missing from CoA`,
  );

  if (mismatches > 0 || missing > 0) {
    console.error('[offline] Fix mapping rules before the online dry-run.');
    process.exit(1);
  } else {
    console.log('[offline] All conventions resolve correctly. Safe to try the online version next.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('[offline] Unexpected error:', err);
  process.exit(1);
});
