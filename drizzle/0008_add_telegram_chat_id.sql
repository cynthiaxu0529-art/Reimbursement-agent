-- 为 users 表添加 telegram_chat_id 列，用于 Telegram 审批提醒
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "telegram_chat_id" text;
