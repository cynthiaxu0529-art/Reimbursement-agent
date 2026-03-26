-- 添加发票号码字段用于去重检测
ALTER TABLE "reimbursement_items" ADD COLUMN IF NOT EXISTS "invoice_number" text;

-- 创建索引以加速发票号码查重查询
CREATE INDEX IF NOT EXISTS "idx_reimbursement_items_invoice_number"
  ON "reimbursement_items" ("invoice_number")
  WHERE "invoice_number" IS NOT NULL;

-- 创建索引以加速凭证 URL 查重查询
CREATE INDEX IF NOT EXISTS "idx_reimbursement_items_receipt_url"
  ON "reimbursement_items" ("receipt_url")
  WHERE "receipt_url" IS NOT NULL;

-- 创建复合索引以加速跨报销单去重查询 (category + amount + date)
CREATE INDEX IF NOT EXISTS "idx_reimbursement_items_dedup"
  ON "reimbursement_items" ("category", "amount", "date");
