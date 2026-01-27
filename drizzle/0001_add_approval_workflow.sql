-- 多级审批工作流迁移
-- 添加审批步骤状态枚举
DO $$ BEGIN
  CREATE TYPE "approval_step_status" AS ENUM('pending', 'approved', 'rejected', 'skipped');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 创建部门表
CREATE TABLE IF NOT EXISTS "departments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "code" text,
  "description" text,
  "parent_id" uuid,
  "manager_id" uuid,
  "approver_ids" jsonb DEFAULT '[]',
  "level" integer DEFAULT 1 NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 为 users 表添加 department_id 字段
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "department_id" uuid;

-- 创建审批链表
CREATE TABLE IF NOT EXISTS "approval_chain" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reimbursement_id" uuid NOT NULL REFERENCES "reimbursements"("id"),
  "step_order" integer NOT NULL,
  "step_type" text NOT NULL,
  "step_name" text NOT NULL,
  "approver_id" uuid REFERENCES "users"("id"),
  "approver_role" text,
  "department_id" uuid,
  "status" "approval_step_status" DEFAULT 'pending' NOT NULL,
  "comment" text,
  "amount_threshold" real,
  "assigned_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 创建审批规则表
CREATE TABLE IF NOT EXISTS "approval_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "description" text,
  "priority" integer DEFAULT 0 NOT NULL,
  "conditions" jsonb DEFAULT '{}' NOT NULL,
  "approval_steps" jsonb DEFAULT '[]' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS "idx_departments_tenant_id" ON "departments"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_departments_parent_id" ON "departments"("parent_id");
CREATE INDEX IF NOT EXISTS "idx_approval_chain_reimbursement_id" ON "approval_chain"("reimbursement_id");
CREATE INDEX IF NOT EXISTS "idx_approval_chain_approver_id" ON "approval_chain"("approver_id");
CREATE INDEX IF NOT EXISTS "idx_approval_chain_status" ON "approval_chain"("status");
CREATE INDEX IF NOT EXISTS "idx_approval_rules_tenant_id" ON "approval_rules"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_users_department_id" ON "users"("department_id");
