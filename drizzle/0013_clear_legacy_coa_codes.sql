-- ============================================================================
-- 0013: Clear legacy dot-notation Chart of Accounts codes
-- ============================================================================
-- Context: integration guide `docs/REIMBURSEMENT_COA_INTEGRATION.md` on the
-- accounting agent side declared the canonical CoA as flat 4-digit codes
-- (6410, 6420, 6425, 6430, 6435, 6440, 6450, 6460, 6470, 6480, 6490, plus
-- S&M 61xx and G&A 62xx/63xx/6350).  The older mapping in this service used
-- dotted codes like `6601.01`, `6602.03`, `6699.01` that do **not** exist in
-- the canonical CoA and would be flagged as "not found in Chart of Accounts"
-- on submission to /api/reimbursement-summaries.
--
-- This migration nulls the legacy codes on historical items so the next
-- summary generation re-derives canonical 4-digit codes via the updated
-- `mapExpenseToAccount` logic (which applies the documented Mapping
-- conventions and gates the result against synced_accounts).
--
-- Also wipes cached entries in `synced_accounts` that have dotted codes so
-- the next `syncChartOfAccounts()` cycle imports clean rows.
-- ============================================================================

UPDATE reimbursement_items
SET
  coa_code = NULL,
  coa_name = NULL,
  previous_coa_code = NULL,
  previous_coa_name = NULL
WHERE
  coa_code IS NOT NULL
  AND (
    coa_code LIKE '6601.%' OR
    coa_code LIKE '6602.%' OR
    coa_code LIKE '6603.%' OR
    coa_code LIKE '6604.%' OR
    coa_code LIKE '6605.%' OR
    coa_code LIKE '6606.%' OR
    coa_code LIKE '6699.%'
  );

DELETE FROM synced_accounts
WHERE account_code LIKE '66__.%';
