-- Per-period reconciliation review state for wallet_reconciliations
--
-- For each wallet_reconciliation upload, we compute a monthly aggregate
-- comparison (system summary total vs wallet outflow total) at query
-- time. This table only stores the finance team's review state per
-- (reconciliation, month) tuple: did someone look at this diff, did they
-- accept it as expected, and what's their note for the auditor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "wallet_reconciliation_period_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reconciliation_id" uuid NOT NULL REFERENCES "wallet_reconciliations"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "period_id" text NOT NULL, -- 'YYYY-MM'
  "status" text NOT NULL DEFAULT 'unreviewed',
  "note" text,
  "reviewed_by" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "wrpn_reconciliation_idx"
  ON "wallet_reconciliation_period_notes" ("reconciliation_id");
CREATE INDEX IF NOT EXISTS "wrpn_period_idx"
  ON "wallet_reconciliation_period_notes" ("tenant_id", "period_id");

-- One note row per (reconciliation, period) tuple. Re-reviewing same period
-- on same upload upserts this row.
CREATE UNIQUE INDEX IF NOT EXISTS "wrpn_reconciliation_period_unique"
  ON "wallet_reconciliation_period_notes" ("reconciliation_id", "period_id");
