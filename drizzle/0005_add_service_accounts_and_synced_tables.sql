-- Add service_accounts, synced_accounts, and reimbursement_summaries tables
-- These tables support Accounting Agent integration:
--   service_accounts: M2M authentication for inter-service API calls
--   synced_accounts: local cache of chart of accounts from Accounting Agent
--   reimbursement_summaries: pre-aggregated summaries for Accounting Agent to pull

-- Service Accounts 表（系统间 M2M 认证）
CREATE TABLE IF NOT EXISTS "service_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

  "service_name" text NOT NULL UNIQUE,
  "description" text,

  -- 认证
  "api_key_hash" text NOT NULL UNIQUE,
  "key_prefix" text NOT NULL,

  -- 权限
  "permissions" jsonb NOT NULL DEFAULT '[]',

  -- 状态
  "is_active" boolean NOT NULL DEFAULT true,
  "last_used_at" timestamp,
  "usage_count" integer NOT NULL DEFAULT 0,

  -- 撤销
  "revoked_at" timestamp,
  "revoke_reason" text,

  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

COMMENT ON TABLE "service_accounts" IS 'Service Account 表，用于系统间 M2M 认证（如 Accounting Agent）';

-- Synced Accounts 表（同步的会计科目表）
CREATE TABLE IF NOT EXISTS "synced_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

  "account_code" text NOT NULL UNIQUE,
  "account_name" text NOT NULL,
  "account_subtype" text,

  "synced_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

COMMENT ON TABLE "synced_accounts" IS '从 Accounting Agent 同步的会计科目表缓存';

-- Reimbursement Summaries 表（报销汇总）
CREATE TABLE IF NOT EXISTS "reimbursement_summaries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

  "summary_id" text NOT NULL UNIQUE,
  "period_start" timestamp NOT NULL,
  "period_end" timestamp NOT NULL,

  -- 汇总数据
  "items" jsonb NOT NULL DEFAULT '[]',
  "total_amount" real NOT NULL DEFAULT 0,
  "total_records" integer NOT NULL DEFAULT 0,
  "currency" text NOT NULL DEFAULT 'USD',

  -- 同步状态
  "is_synced" boolean NOT NULL DEFAULT false,
  "synced_at" timestamp,

  "generated_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

COMMENT ON TABLE "reimbursement_summaries" IS '报销汇总记录，按半月周期+GL科目维度汇总已审批报销';
