-- Wallet reconciliation: compare Fluxa on-chain transfer list vs system payments
--
-- One reconciliation = one CSV upload run. raw_rows keeps the parsed CSV (jsonb)
-- so we can re-run matching after schema changes without re-uploading. Aggregate
-- counts (matched_count, discrepancy_count, ...) live as columns for cheap list
-- queries.
--
-- A discrepancy row = one item that needs finance attention. Successful matches
-- with no amount/address gap don't emit a row, only bump matched_count.

DO $$ BEGIN
  CREATE TYPE "reconciliation_status" AS ENUM ('parsing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "discrepancy_type" AS ENUM (
    'system_only',
    'chain_only',
    'amount_mismatch',
    'address_mismatch',
    'duplicate_payment',
    'low_confidence_match'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "wallet_reconciliations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "uploaded_by" uuid NOT NULL REFERENCES "users"("id"),
  "file_name" text NOT NULL,
  "period_start" timestamp,
  "period_end" timestamp,
  "raw_rows" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "row_count" integer NOT NULL DEFAULT 0,
  "status" "reconciliation_status" NOT NULL DEFAULT 'parsing',
  "error_message" text,
  "csv_total_amount" real NOT NULL DEFAULT 0,
  "matched_count" integer NOT NULL DEFAULT 0,
  "matched_amount" real NOT NULL DEFAULT 0,
  "discrepancy_count" integer NOT NULL DEFAULT 0,
  "tolerance_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "reconciliation_discrepancies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reconciliation_id" uuid NOT NULL REFERENCES "wallet_reconciliations"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "type" "discrepancy_type" NOT NULL,
  "payment_id" uuid REFERENCES "payments"("id"),
  "csv_row_index" integer,
  "csv_row_snapshot" jsonb,
  "matched_by" text,
  "match_confidence" text,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "resolved" boolean NOT NULL DEFAULT false,
  "resolved_by" uuid REFERENCES "users"("id"),
  "resolved_at" timestamp,
  "resolution_note" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "disc_reconciliation_idx" ON "reconciliation_discrepancies" ("reconciliation_id");
CREATE INDEX IF NOT EXISTS "disc_payment_idx" ON "reconciliation_discrepancies" ("payment_id");
CREATE INDEX IF NOT EXISTS "disc_resolved_idx" ON "reconciliation_discrepancies" ("resolved");
CREATE INDEX IF NOT EXISTS "disc_type_idx" ON "reconciliation_discrepancies" ("type");
