-- 邀请表迁移
-- 用于安全的邀请注册流程

-- 邀请状态枚举
DO $$ BEGIN
  CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 邀请表
CREATE TABLE IF NOT EXISTS "invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "name" text,                                      -- 被邀请人姓名（可选）
  "roles" jsonb NOT NULL DEFAULT '["employee"]',   -- 邀请角色数组
  "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "set_as_dept_manager" boolean NOT NULL DEFAULT false,

  -- Token安全
  "token_hash" text NOT NULL UNIQUE,              -- 存储token的哈希值
  "expires_at" timestamp NOT NULL,                 -- 过期时间

  -- 状态跟踪
  "status" "invitation_status" NOT NULL DEFAULT 'pending',
  "accepted_at" timestamp,                         -- 接受时间
  "accepted_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,

  -- 审计字段
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "revoked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "revoked_at" timestamp,
  "revoke_reason" text,

  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS "idx_invitations_tenant_id" ON "invitations"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_invitations_email" ON "invitations"("email");
CREATE INDEX IF NOT EXISTS "idx_invitations_token_hash" ON "invitations"("token_hash");
CREATE INDEX IF NOT EXISTS "idx_invitations_status" ON "invitations"("status");
CREATE INDEX IF NOT EXISTS "idx_invitations_expires_at" ON "invitations"("expires_at");

-- 添加注释
COMMENT ON TABLE "invitations" IS '用户邀请表，用于安全的邀请注册流程';
COMMENT ON COLUMN "invitations"."token_hash" IS '邀请token的SHA-256哈希值，用于验证';
COMMENT ON COLUMN "invitations"."roles" IS '邀请的角色数组，如 ["employee", "manager"]';
COMMENT ON COLUMN "invitations"."status" IS '邀请状态：pending-待接受, accepted-已接受, expired-已过期, revoked-已撤销';
