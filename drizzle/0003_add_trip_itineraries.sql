-- 行程单状态枚举
DO $$ BEGIN
  CREATE TYPE "itinerary_status" AS ENUM('draft', 'confirmed', 'modified');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 行程单表（从报销内容智能生成的行程）
CREATE TABLE IF NOT EXISTS "trip_itineraries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "reimbursement_id" uuid,
  "trip_id" uuid REFERENCES "trips"("id"),
  "title" text NOT NULL,
  "purpose" text,
  "start_date" timestamp,
  "end_date" timestamp,
  "destinations" jsonb DEFAULT '[]',
  "status" "itinerary_status" NOT NULL DEFAULT 'draft',
  "ai_generated" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- 行程明细表
CREATE TABLE IF NOT EXISTS "trip_itinerary_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "itinerary_id" uuid NOT NULL REFERENCES "trip_itineraries"("id") ON DELETE CASCADE,
  "date" timestamp NOT NULL,
  "time" text,
  "type" text NOT NULL,
  "category" text,
  "title" text NOT NULL,
  "description" text,
  "location" text,
  "departure" text,
  "arrival" text,
  "transport_number" text,
  "hotel_name" text,
  "check_in" timestamp,
  "check_out" timestamp,
  "amount" real,
  "currency" text,
  "reimbursement_item_id" uuid,
  "receipt_url" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS "idx_trip_itineraries_user" ON "trip_itineraries" ("user_id", "tenant_id");
CREATE INDEX IF NOT EXISTS "idx_trip_itineraries_reimbursement" ON "trip_itineraries" ("reimbursement_id");
CREATE INDEX IF NOT EXISTS "idx_trip_itinerary_items_itinerary" ON "trip_itinerary_items" ("itinerary_id");
