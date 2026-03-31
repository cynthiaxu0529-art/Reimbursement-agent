-- 添加 reversed 状态到报销单状态枚举
ALTER TYPE reimbursement_status ADD VALUE IF NOT EXISTS 'reversed';

-- 创建冲销记录表
CREATE TABLE IF NOT EXISTS "reversals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "reimbursement_id" uuid NOT NULL REFERENCES "reimbursements"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "amount" real NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "reason" text NOT NULL,
  "category" text NOT NULL DEFAULT 'full',
  "receivable_status" text NOT NULL DEFAULT 'outstanding',
  "repaid_amount" real NOT NULL DEFAULT 0,
  "repaid_at" timestamp,
  "waived_at" timestamp,
  "waived_by" uuid REFERENCES "users"("id"),
  "waived_reason" text,
  "initiated_by" uuid NOT NULL REFERENCES "users"("id"),
  "original_payment_id" uuid,
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS "idx_reversals_tenant" ON "reversals" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_reversals_user" ON "reversals" ("user_id", "receivable_status");
CREATE INDEX IF NOT EXISTS "idx_reversals_reimbursement" ON "reversals" ("reimbursement_id");
