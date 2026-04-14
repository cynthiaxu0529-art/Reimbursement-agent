-- Migration: 更新 S&M 6xxx 科目代码，对齐 Accounting Agent 新 COA
--
-- 旧科目 → 新科目 映射:
--   6110 "S&M - Salaries & Commissions"      → 6100 "S&M - Sales Salaries & Commissions"
--   6120 "S&M - Advertising & Promotion"      → 6120 "S&M - Digital Advertising"  (名称变更)
--   6130 "S&M - Travel & Entertainment"       → 6170 "S&M - Travel & Entertainment"
--   6140 "S&M - Meals & Client Entertainment" → 6180 "S&M - Meals & Entertainment"
--   6150 "S&M - Office Supplies"              → 6190 "S&M - Miscellaneous Expense"
--   6160 "S&M - Training & Conferences"       → 6140 "S&M - Events & Conferences"
--   6190 "S&M - Miscellaneous Expense"        → 6190 (不变)
--
-- 注意：6140/6160 存在代码交叉，必须基于旧 coa_name 匹配，避免误改。
-- 执行顺序：先迁移代码变更的行（6130→6170, 6140→6180），再处理 6160→6140，防止冲突。

BEGIN;

-- ============================================================================
-- 1. 修正 reimbursement_items 历史记录
-- ============================================================================

-- 1a. 6130 → 6170 (Travel: 代码变更，名称不变)
UPDATE reimbursement_items
SET coa_code = '6170',
    coa_name = 'S&M - Travel & Entertainment',
    updated_at = NOW()
WHERE coa_code = '6130'
  AND coa_name LIKE 'S&M%Travel%';

-- 1b. 6140 → 6180 (Meals: 代码变更 + 名称变更)
--     ⚠️ 必须在 6160→6140 之前执行
UPDATE reimbursement_items
SET coa_code = '6180',
    coa_name = 'S&M - Meals & Entertainment',
    updated_at = NOW()
WHERE coa_code = '6140'
  AND coa_name LIKE 'S&M%Meals%';

-- 1c. 6150 → 6190 (Office Supplies: 新 COA 无此科目，归入杂项)
UPDATE reimbursement_items
SET coa_code = '6190',
    coa_name = 'S&M - Miscellaneous Expense',
    updated_at = NOW()
WHERE coa_code = '6150'
  AND coa_name LIKE 'S&M%Office%';

-- 1d. 6160 → 6140 (Training → Events & Conferences)
--     此时旧的 6140 (Meals) 已迁走，安全
UPDATE reimbursement_items
SET coa_code = '6140',
    coa_name = 'S&M - Events & Conferences',
    updated_at = NOW()
WHERE coa_code = '6160'
  AND coa_name LIKE 'S&M%Training%';

-- 1e. 6120 名称变更 (Advertising & Promotion → Digital Advertising)
UPDATE reimbursement_items
SET coa_name = 'S&M - Digital Advertising',
    updated_at = NOW()
WHERE coa_code = '6120'
  AND coa_name LIKE 'S&M%Advertising%';

-- 1f. 6110 → 6100 (Salaries & Commissions → Sales Salaries & Commissions)
--     报销系统中薪资类科目较少见，但仍需处理
UPDATE reimbursement_items
SET coa_code = '6100',
    coa_name = 'S&M - Sales Salaries & Commissions',
    updated_at = NOW()
WHERE coa_code = '6110'
  AND coa_name LIKE 'S&M%Salaries%Commissions%';

-- ============================================================================
-- 2. 刷新 synced_accounts 缓存表（删除旧 S&M 科目，插入新科目）
-- ============================================================================

-- 删除旧的 S&M 科目
DELETE FROM synced_accounts
WHERE account_code IN ('6100','6110','6120','6130','6140','6150','6160','6170','6180','6190')
  AND account_subtype = 'Sales & Marketing';

-- 插入新的 S&M 科目
INSERT INTO synced_accounts (id, account_code, account_name, account_subtype, synced_at, created_at, updated_at)
VALUES
  (gen_random_uuid(), '6100', 'S&M - Sales Salaries & Commissions', 'Sales & Marketing', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '6110', 'S&M - Marketing Salaries',          'Sales & Marketing', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '6120', 'S&M - Digital Advertising',         'Sales & Marketing', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '6130', 'S&M - Content & SEO',               'Sales & Marketing', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '6140', 'S&M - Events & Conferences',        'Sales & Marketing', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '6150', 'S&M - CRM & Sales Tools',           'Sales & Marketing', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '6160', 'S&M - PR & Communications',         'Sales & Marketing', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '6170', 'S&M - Travel & Entertainment',      'Sales & Marketing', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '6180', 'S&M - Meals & Entertainment',       'Sales & Marketing', NOW(), NOW(), NOW()),
  (gen_random_uuid(), '6190', 'S&M - Miscellaneous Expense',       'Sales & Marketing', NOW(), NOW(), NOW())
ON CONFLICT (account_code) DO UPDATE SET
  account_name = EXCLUDED.account_name,
  account_subtype = EXCLUDED.account_subtype,
  synced_at = NOW(),
  updated_at = NOW();

COMMIT;
