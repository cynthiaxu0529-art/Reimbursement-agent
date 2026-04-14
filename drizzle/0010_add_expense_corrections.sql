-- 添加冲差（Expense Corrections）相关表
-- expense_corrections: 记录已付款报销的金额差错，供财务后续冲差
-- correction_applications: 记录每次从新报销中抵扣差额的明细

-- 状态枚举
DO $$ BEGIN
  CREATE TYPE "correction_status" AS ENUM ('pending', 'partial', 'settled', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 冲差记录表
CREATE TABLE IF NOT EXISTS "expense_corrections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "original_reimbursement_id" uuid NOT NULL REFERENCES "reimbursements"("id"),
  "employee_id" uuid NOT NULL REFERENCES "users"("id"),
  "original_paid_amount" real NOT NULL,
  "corrected_amount" real NOT NULL,
  "difference_amount" real NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "applied_amount" real NOT NULL DEFAULT 0,
  "remaining_amount" real NOT NULL,
  "status" correction_status NOT NULL DEFAULT 'pending',
  "reason" text NOT NULL,
  "correction_note" text,
  "error_category" text,
  "flagged_by" uuid NOT NULL REFERENCES "users"("id"),
  "flagged_at" timestamp NOT NULL DEFAULT now(),
  "settled_at" timestamp,
  "cancelled_at" timestamp,
  "cancel_reason" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- 冲差应用记录表
CREATE TABLE IF NOT EXISTS "correction_applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "correction_id" uuid NOT NULL REFERENCES "expense_corrections"("id"),
  "target_reimbursement_id" uuid NOT NULL REFERENCES "reimbursements"("id"),
  "applied_amount" real NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "original_payment_amount" real NOT NULL,
  "adjusted_payment_amount" real NOT NULL,
  "note" text,
  "applied_by" uuid NOT NULL REFERENCES "users"("id"),
  "applied_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS "idx_expense_corrections_tenant" ON "expense_corrections" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_expense_corrections_employee" ON "expense_corrections" ("employee_id", "status");
CREATE INDEX IF NOT EXISTS "idx_expense_corrections_reimbursement" ON "expense_corrections" ("original_reimbursement_id");
CREATE INDEX IF NOT EXISTS "idx_correction_applications_correction" ON "correction_applications" ("correction_id");
CREATE INDEX IF NOT EXISTS "idx_correction_applications_target" ON "correction_applications" ("target_reimbursement_id");
