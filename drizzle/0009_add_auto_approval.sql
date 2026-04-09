-- 自动审批 & 自动付款迁移
-- Auto-Approval & Auto-Payment tables

-- 审批人自动审批总配置表
CREATE TABLE IF NOT EXISTS "auto_approval_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "is_enabled" boolean DEFAULT false NOT NULL,
  "max_amount_cap_usd" real DEFAULT 500 NOT NULL,
  "daily_limit_usd" real DEFAULT 2000 NOT NULL,
  "cancellation_window_minutes" integer DEFAULT 60 NOT NULL,
  "expires_at" timestamp,
  "last_triggered_at" timestamp,
  "total_auto_approved_count" integer DEFAULT 0 NOT NULL,
  "total_auto_approved_usd" real DEFAULT 0 NOT NULL,
  "created_via_chat" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  UNIQUE("tenant_id", "user_id")
);

-- Memory 模式规则表
CREATE TABLE IF NOT EXISTS "auto_approval_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid NOT NULL REFERENCES "auto_approval_profiles"("id") ON DELETE CASCADE,
  "priority" integer DEFAULT 100 NOT NULL,
  "name" text NOT NULL,
  "conditions" jsonb DEFAULT '{}' NOT NULL,
  "action" text DEFAULT 'approve' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 自动审批决策日志表
CREATE TABLE IF NOT EXISTS "auto_approval_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "reimbursement_id" uuid NOT NULL REFERENCES "reimbursements"("id"),
  "approval_chain_step_id" uuid NOT NULL REFERENCES "approval_chain"("id"),
  "approver_id" uuid NOT NULL REFERENCES "users"("id"),
  "profile_id" uuid REFERENCES "auto_approval_profiles"("id"),
  "decision" text NOT NULL,
  "skip_reason" text,
  "risk_check_results" jsonb DEFAULT '{}' NOT NULL,
  "rule_matched_name" text,
  "rule_matched_id" uuid,
  "cancel_window_ends_at" timestamp,
  "cancelled_by_user_id" uuid REFERENCES "users"("id"),
  "cancelled_at" timestamp,
  "executed_at" timestamp,
  "amount_usd" real,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- 财务自动付款配置表
CREATE TABLE IF NOT EXISTS "auto_payment_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "is_enabled" boolean DEFAULT false NOT NULL,
  "emergency_pause" boolean DEFAULT false NOT NULL,
  "emergency_paused_by" uuid REFERENCES "users"("id"),
  "emergency_paused_at" timestamp,
  "conditions" jsonb DEFAULT '{}' NOT NULL,
  "expires_at" timestamp,
  "total_auto_payment_count" integer DEFAULT 0 NOT NULL,
  "total_auto_payment_usd" real DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS "idx_auto_approval_profiles_user" ON "auto_approval_profiles"("user_id", "tenant_id");
CREATE INDEX IF NOT EXISTS "idx_auto_approval_rules_profile" ON "auto_approval_rules"("profile_id", "priority");
CREATE INDEX IF NOT EXISTS "idx_auto_approval_logs_reimbursement" ON "auto_approval_logs"("reimbursement_id");
CREATE INDEX IF NOT EXISTS "idx_auto_approval_logs_approver" ON "auto_approval_logs"("approver_id", "decision");
CREATE INDEX IF NOT EXISTS "idx_auto_approval_logs_queued" ON "auto_approval_logs"("decision", "cancel_window_ends_at");
CREATE INDEX IF NOT EXISTS "idx_auto_approval_logs_tenant" ON "auto_approval_logs"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_auto_payment_profiles_tenant" ON "auto_payment_profiles"("tenant_id");
