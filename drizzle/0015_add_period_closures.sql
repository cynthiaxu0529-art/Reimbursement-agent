-- Period closure mechanism (SOX-lite, SMB style)
--
-- Monthly close: super_admin can lock a 'YYYY-MM' period; once locked, the
-- summary endpoints reroute unsynced items whose item.date falls in that
-- month to the current open half-month period, tagged as late_filing.
-- Already-synced items don't move (preserves accounting agent bookkeeping).
--
-- Audit log table records every state transition with actor + reason for
-- auditor traceability.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE "period_closure_status" AS ENUM ('open', 'locked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "accounting_period_closures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "period_id" text NOT NULL,
  "status" "period_closure_status" NOT NULL DEFAULT 'open',
  "closed_at" timestamp,
  "closed_by" uuid REFERENCES "users"("id"),
  "reason" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "apc_tenant_period_idx"
  ON "accounting_period_closures" ("tenant_id", "period_id");

-- One row per (tenant, period). Status moves between 'open' and 'locked'
-- via the audit-logged API; rows are upserted, never duplicated.
CREATE UNIQUE INDEX IF NOT EXISTS "apc_tenant_period_unique"
  ON "accounting_period_closures" ("tenant_id", "period_id");

CREATE TABLE IF NOT EXISTS "period_closure_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "period_id" text NOT NULL,
  "action" text NOT NULL,
  "actor_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "actor_email_snapshot" text NOT NULL,
  "reason" text,
  "prev_state" jsonb,
  "new_state" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "pcal_tenant_period_idx"
  ON "period_closure_audit_log" ("tenant_id", "period_id");
CREATE INDEX IF NOT EXISTS "pcal_created_at_idx"
  ON "period_closure_audit_log" ("created_at");

-- Stable bucket assignment for items rerouted by closure logic.
-- NULL means "compute from item.date" (default behavior unchanged).
-- Set automatically by summary endpoint when an item is first emitted under
-- a non-natural period due to its natural month being locked.
ALTER TABLE "reimbursement_items"
  ADD COLUMN IF NOT EXISTS "posted_period_id" text;

ALTER TABLE "reimbursement_items"
  ADD COLUMN IF NOT EXISTS "is_accrual" boolean NOT NULL DEFAULT false;

ALTER TABLE "correction_applications"
  ADD COLUMN IF NOT EXISTS "posted_period_id" text;
