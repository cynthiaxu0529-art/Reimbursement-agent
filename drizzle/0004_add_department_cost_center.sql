-- Add cost_center column to departments table
-- Values: 'rd' (R&D 研发费用), 'sm' (S&M 销售费用), 'ga' (G&A 管理费用, default)
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "cost_center" text;

-- Auto-classify existing departments based on name keywords
-- R&D: 研发/技术/工程/开发/产品/测试/数据/AI/平台/CTO
UPDATE "departments" SET "cost_center" = 'rd'
WHERE "cost_center" IS NULL
  AND (
    "name" ~* '(研发|技术|工程|开发|算法|架构|测试|QA|产品|数据|AI|ML|平台|DevOps|SRE|CTO)'
    OR "name" ~* '(R&D|Engineering|Tech|Development|Product|Data|Platform)'
    OR "code" ~* '(RD|ENG|TECH|DEV|PROD|DATA|CTO)'
  );

-- S&M: 销售/市场/营销/商务/品牌/增长/客户成功/CMO/CSO
UPDATE "departments" SET "cost_center" = 'sm'
WHERE "cost_center" IS NULL
  AND (
    "name" ~* '(销售|市场|营销|商务|品牌|增长|获客|客户成功|CMO|CSO)'
    OR "name" ~* '(Sales|Marketing|Growth|BD|Business Development|GTM|Revenue)'
    OR "code" ~* '(SM|SALES|MKT|BD|CMO|CSO)'
  );

-- G&A: everything else (CEO/COO/行政/财务/法务/HR/...)
UPDATE "departments" SET "cost_center" = 'ga'
WHERE "cost_center" IS NULL;
