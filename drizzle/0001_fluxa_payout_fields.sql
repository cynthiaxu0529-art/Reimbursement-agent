-- Migration: Add Fluxa Payout fields to payments table
-- This migration adds support for Fluxa wallet payout integration

-- Add new columns for Fluxa payout tracking
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payout_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS approval_url TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payout_status TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS to_address TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS initiated_by UUID REFERENCES users(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create index for payout_id lookups
CREATE INDEX IF NOT EXISTS idx_payments_payout_id ON payments(payout_id);

-- Create index for payout_status filtering
CREATE INDEX IF NOT EXISTS idx_payments_payout_status ON payments(payout_status);

-- Update payment_provider default to 'fluxa'
ALTER TABLE payments ALTER COLUMN payment_provider SET DEFAULT 'fluxa';

-- Comment on new columns
COMMENT ON COLUMN payments.payout_id IS 'Fluxa payout unique identifier';
COMMENT ON COLUMN payments.approval_url IS 'URL for finance to approve the payout in Fluxa wallet';
COMMENT ON COLUMN payments.payout_status IS 'Fluxa payout status: pending_authorization, authorized, signed, broadcasting, succeeded, failed, expired';
COMMENT ON COLUMN payments.tx_hash IS 'Blockchain transaction hash after payout is executed';
COMMENT ON COLUMN payments.expires_at IS 'Timestamp when the payout approval expires';
COMMENT ON COLUMN payments.to_address IS 'Recipient wallet address on Base chain';
COMMENT ON COLUMN payments.initiated_by IS 'User ID of the finance person who initiated the payout';
