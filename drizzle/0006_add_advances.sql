-- 预借款表
CREATE TABLE IF NOT EXISTS "advances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "title" text NOT NULL,
  "description" text,
  "purpose" text,
  "amount" real NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "status" text NOT NULL DEFAULT 'pending',
  "approved_by" uuid REFERENCES "users"("id"),
  "approved_at" timestamp,
  "rejected_by" uuid REFERENCES "users"("id"),
  "rejected_at" timestamp,
  "reject_reason" text,
  "paid_at" timestamp,
  "payment_id" text,
  "reconciled_amount" real DEFAULT 0,
  "reconciled_at" timestamp,
  "reconciliation_note" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- 预借款核销记录表
CREATE TABLE IF NOT EXISTS "advance_reconciliations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "advance_id" uuid NOT NULL REFERENCES "advances"("id"),
  "reimbursement_id" uuid NOT NULL REFERENCES "reimbursements"("id"),
  "amount" real NOT NULL,
  "note" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS "advances_tenant_id_idx" ON "advances"("tenant_id");
CREATE INDEX IF NOT EXISTS "advances_user_id_idx" ON "advances"("user_id");
CREATE INDEX IF NOT EXISTS "advances_status_idx" ON "advances"("status");
CREATE INDEX IF NOT EXISTS "advance_reconciliations_advance_id_idx" ON "advance_reconciliations"("advance_id");
CREATE INDEX IF NOT EXISTS "advance_reconciliations_reimbursement_id_idx" ON "advance_reconciliations"("reimbursement_id");
