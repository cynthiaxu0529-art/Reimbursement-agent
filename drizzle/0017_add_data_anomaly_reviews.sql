-- Data anomaly review state
--
-- Stores finance team's review decisions on data anomalies surfaced by
-- the wallet-reconciliation 数据审计 tab. Anomalies themselves are
-- detected on-the-fly by scanning payments × reimbursements consistency
-- — only the review state is persisted.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "data_anomaly_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "anomaly_key" text NOT NULL,
  "status" text NOT NULL,
  "note" text,
  "reviewed_by" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "dar_tenant_idx" ON "data_anomaly_reviews" ("tenant_id");
CREATE INDEX IF NOT EXISTS "dar_key_idx" ON "data_anomaly_reviews" ("tenant_id", "anomaly_key");

-- One review row per (tenant, anomaly_key) tuple. Re-reviewing same anomaly
-- updates the same row.
CREATE UNIQUE INDEX IF NOT EXISTS "dar_tenant_key_unique"
  ON "data_anomaly_reviews" ("tenant_id", "anomaly_key");
