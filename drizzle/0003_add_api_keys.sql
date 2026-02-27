-- API Key 和 Agent 审计日志迁移
-- 用于 OpenClaw 等 AI Agent 的 M2M 认证和操作审计

-- API Keys 表
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,

  -- Key 标识
  "name" text NOT NULL,
  "key_prefix" text NOT NULL,
  "key_hash" text NOT NULL UNIQUE,

  -- 权限范围
  "scopes" jsonb NOT NULL DEFAULT '[]',

  -- Agent 元数据
  "agent_type" text,
  "agent_metadata" jsonb,

  -- 速率限制
  "rate_limit_per_minute" integer NOT NULL DEFAULT 60,
  "rate_limit_per_day" integer NOT NULL DEFAULT 1000,

  -- 金额限制
  "max_amount_per_request" real,
  "max_amount_per_day" real,

  -- 状态管理
  "is_active" boolean NOT NULL DEFAULT true,
  "expires_at" timestamp,
  "last_used_at" timestamp,
  "usage_count" integer NOT NULL DEFAULT 0,

  -- 撤销信息
  "revoked_at" timestamp,
  "revoked_by" uuid REFERENCES "users"("id"),
  "revoke_reason" text,

  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- API Keys 索引
CREATE INDEX IF NOT EXISTS "idx_api_keys_user" ON "api_keys"("user_id", "tenant_id");

-- Agent 操作审计日志表
CREATE TABLE IF NOT EXISTS "agent_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "api_key_id" uuid NOT NULL REFERENCES "api_keys"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),

  -- 操作信息
  "action" text NOT NULL,
  "method" text NOT NULL,
  "path" text NOT NULL,
  "status_code" integer,

  -- Agent 信息
  "agent_type" text,
  "agent_version" text,

  -- 请求/响应摘要
  "request_summary" jsonb,
  "response_summary" jsonb,

  -- 资源信息
  "entity_type" text,
  "entity_id" uuid,

  -- 元数据
  "ip_address" text,
  "user_agent" text,
  "duration_ms" integer,

  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Agent 审计日志索引
CREATE INDEX IF NOT EXISTS "idx_agent_audit_tenant_created" ON "agent_audit_logs"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_agent_audit_apikey" ON "agent_audit_logs"("api_key_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_agent_audit_user" ON "agent_audit_logs"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_agent_audit_action" ON "agent_audit_logs"("tenant_id", "action", "created_at");
CREATE INDEX IF NOT EXISTS "idx_agent_audit_agent_type" ON "agent_audit_logs"("tenant_id", "agent_type", "created_at");

-- 注释
COMMENT ON TABLE "api_keys" IS 'API Key 表，用于 AI Agent 的 M2M 认证';
COMMENT ON TABLE "agent_audit_logs" IS 'Agent 操作审计日志，记录所有通过 API Key 执行的操作';
COMMENT ON COLUMN "api_keys"."key_hash" IS 'API Key 的 SHA-256 哈希值，用于认证校验';
COMMENT ON COLUMN "api_keys"."scopes" IS '权限范围数组，如 ["reimbursement:read", "reimbursement:create"]';
