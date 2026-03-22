-- 密码重置令牌表
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
