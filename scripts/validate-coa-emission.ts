/**
 * Dry-run the Migration checklist test period:
 *
 * 1. Force-sync Chart of Accounts from Accounting Agent.
 * 2. For each canonical case in the Mapping conventions (company-wide SaaS,
 *    Web3 RPC, Web3 subscription, GPU compute, AI APIs, KOL, 红包 / rewards,
 *    plus the common travel/meal/office cases), run `mapExpenseToAccount`
 *    across rd / sm / ga cost centers.
 * 3. Assert every derived `accountCode` exists in `synced_accounts`.
 * 4. Print a report. Exit non-zero if any item would be flagged as
 *    "not found in Chart of Accounts" on the accounting side.
 *
 * Usage:
 *   ACCOUNTING_AGENT_URL=https://... \
 *   ACCOUNTING_AGENT_API_KEY=sk_svc_... \
 *   POSTGRES_URL=postgres://... \
 *   npx tsx scripts/validate-coa-emission.ts
 */

import {
  syncChartOfAccounts,
  isKnownAccountCode,
  getLocalAccounts,
} from '@/lib/accounting/chart-of-accounts-sync';
import { mapExpenseToAccount } from '@/lib/accounting/expense-account-mapping';

interface Case {
  name: string;
  category: string;
  description: string;
  costCenter: 'rd' | 'sm' | 'ga';
  expectCode: string; // canonical code we expect the mapper to emit
}

const CASES: Case[] = [
  // Company-wide SaaS → 6350 regardless of function ("who uses", not "who paid")
  { name: 'Notion subscription paid by R&D engineer',           category: 'company_saas',      description: 'Notion team plan',             costCenter: 'rd', expectCode: '6350' },
  { name: 'Slack paid by sales rep',                            category: 'company_saas',      description: 'Slack Pro',                    costCenter: 'sm', expectCode: '6350' },
  { name: 'Zoom paid by ops lead',                              category: 'company_saas',      description: 'Zoom Business',                costCenter: 'ga', expectCode: '6350' },
  { name: '1Password family plan (company-wide)',               category: 'company_saas',      description: '1Password Business',           costCenter: 'rd', expectCode: '6350' },
  { name: 'Google Workspace renewal',                           category: 'company_saas',      description: 'Google Workspace',             costCenter: 'ga', expectCode: '6350' },

  // Web3 RPC / consumption infrastructure → 6425
  { name: 'Alchemy RPC credits',                                category: 'web3_rpc',          description: 'Alchemy monthly RPC usage',    costCenter: 'rd', expectCode: '6425' },
  { name: 'Infura node billing',                                category: 'cloud_resource',    description: 'Infura metered billing',       costCenter: 'rd', expectCode: '6425' },
  { name: 'QuickNode indexers',                                 category: 'cloud_resource',    description: 'QuickNode rpc',                costCenter: 'rd', expectCode: '6425' },
  { name: 'ZAN on-chain indexer',                               category: 'cloud_resource',    description: 'zan.top indexer',              costCenter: 'rd', expectCode: '6425' },

  // Web3 SDK / subscription → 6430
  { name: 'Privy hosted auth',                                  category: 'web3_subscription', description: 'privy.io monthly plan',        costCenter: 'rd', expectCode: '6430' },
  { name: 'Dynamic wallet SDK',                                 category: 'web3_subscription', description: 'dynamic.xyz sdk subscription', costCenter: 'rd', expectCode: '6430' },

  // GPU / ML compute → 6420
  { name: 'Runpod GPU rental',                                  category: 'gpu_compute',       description: 'Runpod A100 rental',           costCenter: 'rd', expectCode: '6420' },
  { name: 'Lambda Labs H100',                                   category: 'cloud_resource',    description: 'Lambda Labs H100 hours',       costCenter: 'rd', expectCode: '6420' },
  { name: 'Vast.ai spot GPU',                                   category: 'cloud_resource',    description: 'vast.ai spot',                 costCenter: 'rd', expectCode: '6420' },

  // AI / LLM APIs → 6435
  { name: 'OpenAI API usage',                                   category: 'ai_api',            description: 'OpenAI monthly',               costCenter: 'rd', expectCode: '6435' },
  { name: 'Anthropic API usage',                                category: 'ai_token',          description: 'Anthropic Claude API',         costCenter: 'rd', expectCode: '6435' },
  { name: 'OpenRouter proxy',                                   category: 'ai_token',          description: 'OpenRouter usage',             costCenter: 'rd', expectCode: '6435' },
  { name: 'Firecrawl crawler API',                              category: 'ai_api',            description: 'Firecrawl extract API',        costCenter: 'rd', expectCode: '6435' },

  // S&M KOL → 6125 (NOT 6120 advertising)
  { name: 'KOL influencer fee',                                 category: 'kol',               description: 'KOL 小红书达人推广',           costCenter: 'sm', expectCode: '6125' },
  { name: 'KOC sponsored post',                                 category: 'marketing',         description: 'KOC creator collaboration',    costCenter: 'sm', expectCode: '6125' },

  // S&M red packet / community rewards → 6145
  { name: 'User onboarding red packets',                        category: 'red_packet',        description: '运营红包用户激励',               costCenter: 'sm', expectCode: '6145' },
  { name: 'Airdrop to community',                               category: 'marketing',         description: 'airdrop 空投奖励',              costCenter: 'sm', expectCode: '6145' },
  { name: 'Referral bonus payout',                              category: 'marketing',         description: '邀请奖励 referral bonus',       costCenter: 'sm', expectCode: '6145' },

  // Paid ads keep routing to 6120
  { name: 'Google Ads paid spend',                              category: 'marketing',         description: 'Google Ads budget',            costCenter: 'sm', expectCode: '6120' },

  // Baseline travel / meal / office should still resolve
  { name: 'Hotel in R&D trip',                                  category: 'hotel',             description: '差旅住宿',                       costCenter: 'rd', expectCode: '6440' },
  { name: 'Team lunch',                                         category: 'meal',              description: '午餐',                           costCenter: 'rd', expectCode: '6450' },
  { name: 'R&D office supplies',                                category: 'office_supplies',   description: '办公用品',                       costCenter: 'rd', expectCode: '6410' },
];

async function main() {
  console.log('[validate-coa] Syncing Chart of Accounts from Accounting Agent...');
  const sync = await syncChartOfAccounts();
  console.log(`[validate-coa] Sync: source=${sync.source} count=${sync.accountCount}`);

  const local = await getLocalAccounts();
  const knownCodes = new Set(local.map((a) => a.accountCode));
  console.log(`[validate-coa] Local synced_accounts has ${knownCodes.size} codes.`);

  // Sanity: no dotted legacy codes should remain in synced_accounts
  const dotted = local.filter((a) => /^66\d{2}\./.test(a.accountCode));
  if (dotted.length) {
    console.error(`[validate-coa] FAIL: synced_accounts still contains legacy dotted codes: ${dotted.map((d) => d.accountCode).join(', ')}`);
    process.exitCode = 1;
  }

  let passed = 0;
  let mismatches = 0;
  let missing = 0;

  for (const tc of CASES) {
    const res = await mapExpenseToAccount(tc.category, tc.description, tc.costCenter);
    const inCoA = await isKnownAccountCode(res.accountCode);

    const codeMatch = res.accountCode === tc.expectCode;
    const statusIcon = codeMatch && inCoA ? '✓' : '✗';

    console.log(
      `  ${statusIcon} ${tc.name.padEnd(48)} → ${res.accountCode} (${res.accountName}) ` +
        `${codeMatch ? '' : `[expected ${tc.expectCode}]`} ` +
        `${inCoA ? '' : '[NOT IN CoA]'}`,
    );

    if (codeMatch && inCoA) passed++;
    if (!codeMatch) mismatches++;
    if (!inCoA) missing++;
  }

  console.log('');
  console.log(`[validate-coa] Summary: ${passed}/${CASES.length} passed, ${mismatches} mismatched, ${missing} missing from CoA`);

  if (mismatches > 0 || missing > 0) {
    process.exitCode = 1;
    console.error('[validate-coa] Test period would produce warnings on accounting side — fix mapping rules.');
  } else {
    console.log('[validate-coa] All cases resolve to codes present in the canonical CoA. Accounting-side review queue should be clean.');
  }

  process.exit(process.exitCode ?? 0);
}

main().catch((err) => {
  console.error('[validate-coa] Unexpected error:', err);
  process.exit(1);
});
