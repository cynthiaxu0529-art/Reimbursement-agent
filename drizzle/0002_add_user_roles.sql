-- 添加多角色支持
-- 为用户表添加 roles 数组字段

-- 添加 roles 字段（JSONB 数组）
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "roles" jsonb DEFAULT '["employee"]';

-- 同步现有用户的 roles 字段：从 role 字段复制
UPDATE "users"
SET "roles" = jsonb_build_array("role"::text)
WHERE "roles" IS NULL OR "roles" = '["employee"]';

-- 为管理员/财务等特殊角色用户添加 employee 角色（确保他们也能提交报销）
UPDATE "users"
SET "roles" = "roles" || '["employee"]'::jsonb
WHERE "role" IN ('manager', 'finance', 'admin', 'super_admin')
  AND NOT ("roles" @> '["employee"]');
