-- Add sync tracking columns to correction_applications
-- Mirrors reimbursement_items.synced_je_id / synced_at so the accounting
-- agent can idempotently post journal entries for correction adjustments
-- (account 1220) surfaced in accounting summaries.

ALTER TABLE "correction_applications" ADD COLUMN IF NOT EXISTS "synced_je_id" text;
ALTER TABLE "correction_applications" ADD COLUMN IF NOT EXISTS "synced_at" timestamp;
