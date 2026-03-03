-- Add cost_center column to departments table
-- Values: 'rd' (R&D 研发费用), 'sm' (S&M 销售费用), 'ga' (G&A 管理费用, default)
ALTER TABLE "departments" ADD COLUMN "cost_center" text;
