-- ============================================================================
-- 0018: Lock contract-mandated routing for historical reimbursement_items
-- ============================================================================
-- Context: integration guide (docs/REIMBURSEMENT_COA_INTEGRATION.md) Mapping
-- conventions sections #2–#5 specify that several expense types route to a
-- single canonical GL account regardless of which department paid:
--
--   AI APIs (ai_api / ai_token)        → 6435 R&D - AI & API Services
--   GPU compute (gpu_compute)          → 6420 R&D - Cloud & Infrastructure
--   Web3 consumption RPC (web3_rpc)    → 6425 R&D - Blockchain & On-chain Services
--   Web3 SDK / subscription            → 6430 R&D - Software & Subscriptions
--   KOL / influencer (kol)             → 6125 S&M - Influencer & KOL Marketing
--   Red packets / airdrops             → 6145 S&M - Community Rewards & Incentives
--   Paid ads (marketing)               → 6120 S&M - Digital Advertising
--   Content / SEO                      → 6130 S&M - Content & SEO
--   PR / press                         → 6160 S&M - PR & Communications
--
-- Before this PR, src/lib/accounting/account-rules.ts split these by payer
-- department, so a COO submitting an OpenAI receipt would land on 6350 G&A
-- (Dues & Subscriptions) instead of 6435 R&D. This migration retro-fits all
-- historical reimbursement_items so accounting books the right line items.
--
-- previous_coa_code / previous_coa_name capture the old value — the
-- accounting agent uses these to UPDATE existing JEs on next /api/reimbursement-summaries
-- pull instead of duplicating entries. coa_changed_at is set to now() so the
-- next sync window picks the row up.
-- ============================================================================

-- AI APIs → 6435
UPDATE reimbursement_items
SET previous_coa_code = coa_code,
    previous_coa_name = coa_name,
    coa_changed_at    = NOW(),
    coa_code          = '6435',
    coa_name          = 'R&D - AI & API Services'
WHERE category IN ('ai_api', 'ai_token')
  AND coa_code IS NOT NULL
  AND coa_code <> '6435';

-- GPU compute → 6420
UPDATE reimbursement_items
SET previous_coa_code = coa_code,
    previous_coa_name = coa_name,
    coa_changed_at    = NOW(),
    coa_code          = '6420',
    coa_name          = 'R&D - Cloud & Infrastructure'
WHERE category = 'gpu_compute'
  AND coa_code IS NOT NULL
  AND coa_code <> '6420';

-- Web3 RPC / nodes / indexers → 6425
UPDATE reimbursement_items
SET previous_coa_code = coa_code,
    previous_coa_name = coa_name,
    coa_changed_at    = NOW(),
    coa_code          = '6425',
    coa_name          = 'R&D - Blockchain & On-chain Services'
WHERE category IN ('web3_rpc', 'rpc')
  AND coa_code IS NOT NULL
  AND coa_code <> '6425';

-- Web3 SDK / subscription → 6430
UPDATE reimbursement_items
SET previous_coa_code = coa_code,
    previous_coa_name = coa_name,
    coa_changed_at    = NOW(),
    coa_code          = '6430',
    coa_name          = 'R&D - Software & Subscriptions'
WHERE category = 'web3_subscription'
  AND coa_code IS NOT NULL
  AND coa_code <> '6430';

-- KOL / influencer → 6125
UPDATE reimbursement_items
SET previous_coa_code = coa_code,
    previous_coa_name = coa_name,
    coa_changed_at    = NOW(),
    coa_code          = '6125',
    coa_name          = 'S&M - Influencer & KOL Marketing'
WHERE category IN ('kol', 'influencer')
  AND coa_code IS NOT NULL
  AND coa_code <> '6125';

-- Red packets / airdrops / referral payouts → 6145
UPDATE reimbursement_items
SET previous_coa_code = coa_code,
    previous_coa_name = coa_name,
    coa_changed_at    = NOW(),
    coa_code          = '6145',
    coa_name          = 'S&M - Community Rewards & Incentives'
WHERE category IN ('red_packet', 'airdrop', 'rewards', 'referral')
  AND coa_code IS NOT NULL
  AND coa_code <> '6145';

-- Paid ads → 6120
UPDATE reimbursement_items
SET previous_coa_code = coa_code,
    previous_coa_name = coa_name,
    coa_changed_at    = NOW(),
    coa_code          = '6120',
    coa_name          = 'S&M - Digital Advertising'
WHERE category IN ('marketing', 'advertising')
  AND coa_code IS NOT NULL
  AND coa_code <> '6120';

-- Content / SEO → 6130
UPDATE reimbursement_items
SET previous_coa_code = coa_code,
    previous_coa_name = coa_name,
    coa_changed_at    = NOW(),
    coa_code          = '6130',
    coa_name          = 'S&M - Content & SEO'
WHERE category IN ('content_seo', 'content', 'seo')
  AND coa_code IS NOT NULL
  AND coa_code <> '6130';

-- PR / press / communications → 6160
UPDATE reimbursement_items
SET previous_coa_code = coa_code,
    previous_coa_name = coa_name,
    coa_changed_at    = NOW(),
    coa_code          = '6160',
    coa_name          = 'S&M - PR & Communications'
WHERE category IN ('pr_communications', 'pr', 'communications')
  AND coa_code IS NOT NULL
  AND coa_code <> '6160';
