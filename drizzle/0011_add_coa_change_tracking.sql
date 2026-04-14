-- Add COA change tracking and sync tracking columns to reimbursement_items
-- These columns prevent duplicate JE creation when account codes change

ALTER TABLE "reimbursement_items" ADD COLUMN IF NOT EXISTS "previous_coa_code" text;
ALTER TABLE "reimbursement_items" ADD COLUMN IF NOT EXISTS "previous_coa_name" text;
ALTER TABLE "reimbursement_items" ADD COLUMN IF NOT EXISTS "coa_changed_at" timestamp;
ALTER TABLE "reimbursement_items" ADD COLUMN IF NOT EXISTS "synced_je_id" text;
ALTER TABLE "reimbursement_items" ADD COLUMN IF NOT EXISTS "synced_at" timestamp;
