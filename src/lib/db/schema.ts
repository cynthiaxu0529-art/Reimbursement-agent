/**
 * 数据库 Schema 定义 (Drizzle ORM)
 */

import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  uuid,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================================
// Enums
// ============================================================================

export const userRoleEnum = pgEnum('user_role', [
  'employee',
  'manager',
  'finance',
  'admin',
  'super_admin',
]);

export const reimbursementStatusEnum = pgEnum('reimbursement_status', [
  'draft',
  'pending',
  'under_review',
  'approved',
  'rejected',
  'processing',
  'paid',
  'cancelled',
]);

export const tripStatusEnum = pgEnum('trip_status', [
  'planning',
  'ongoing',
  'completed',
  'cancelled',
]);

export const complianceStatusEnum = pgEnum('compliance_status', [
  'pending',
  'passed',
  'warning',
  'failed',
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * 租户表
 */
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan').notNull().default('free'),
  baseCurrency: text('base_currency').notNull().default('CNY'),
  settings: jsonb('settings').default({}),
  coaMappings: jsonb('coa_mappings').default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * 用户表 (兼容 NextAuth)
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  name: text('name').notNull(),
  avatar: text('avatar'),
  image: text('image'), // NextAuth 使用的头像字段
  passwordHash: text('password_hash'), // 密码登录
  role: userRoleEnum('role').notNull().default('employee'),
  department: text('department'),
  managerId: uuid('manager_id'),
  bankAccount: jsonb('bank_account'),
  preferences: jsonb('preferences').default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * NextAuth - 账号表 (OAuth 登录)
 */
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
});

/**
 * NextAuth - 会话表
 */
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionToken: text('session_token').notNull().unique(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

/**
 * NextAuth - 验证令牌表
 */
export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull().unique(),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

/**
 * 行程表
 */
export const trips = pgTable('trips', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  title: text('title').notNull(),
  purpose: text('purpose'),
  destination: text('destination'),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  status: tripStatusEnum('status').notNull().default('planning'),

  // 预算 - 允许为空，可由 AI 预估
  budget: jsonb('budget'),
  aiEstimatedBudget: jsonb('ai_estimated_budget'),
  aiRecommendedBudget: jsonb('ai_recommended_budget'),
  budgetSource: text('budget_source'),

  calendarEventIds: jsonb('calendar_event_ids').default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * 报销单表
 */
export const reimbursements = pgTable('reimbursements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  tripId: uuid('trip_id').references(() => trips.id),

  title: text('title').notNull(),
  description: text('description'),

  totalAmount: real('total_amount').notNull().default(0),
  totalAmountInBaseCurrency: real('total_amount_in_base_currency').notNull().default(0),
  baseCurrency: text('base_currency').notNull().default('CNY'),

  status: reimbursementStatusEnum('status').notNull().default('draft'),

  autoCollected: boolean('auto_collected').notNull().default(false),
  sourceType: text('source_type').notNull().default('manual'),

  complianceStatus: complianceStatusEnum('compliance_status').default('pending'),
  complianceIssues: jsonb('compliance_issues').default([]),
  aiSuggestions: jsonb('ai_suggestions').default([]),

  submittedAt: timestamp('submitted_at'),
  approvedAt: timestamp('approved_at'),
  approvedBy: uuid('approved_by'),
  rejectedAt: timestamp('rejected_at'),
  rejectedBy: uuid('rejected_by'),
  rejectReason: text('reject_reason'),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * 报销明细表
 */
export const reimbursementItems = pgTable('reimbursement_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  reimbursementId: uuid('reimbursement_id')
    .notNull()
    .references(() => reimbursements.id),

  category: text('category').notNull(),
  description: text('description').notNull(),

  amount: real('amount').notNull(),
  currency: text('currency').notNull(),
  exchangeRate: real('exchange_rate'),
  amountInBaseCurrency: real('amount_in_base_currency').notNull(),

  date: timestamp('date').notNull(),
  location: text('location'), // 允许为空
  vendor: text('vendor'),

  // Hotel specific fields
  checkInDate: timestamp('check_in_date'),
  checkOutDate: timestamp('check_out_date'),
  nights: integer('nights'),

  receiptId: uuid('receipt_id'),
  receiptUrl: text('receipt_url'),

  extractedFromEmail: boolean('extracted_from_email').default(false),
  ocrConfidence: real('ocr_confidence'),

  policyCheck: jsonb('policy_check'),
  coaCode: text('coa_code'),
  coaName: text('coa_name'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * 票据表
 */
export const receipts = pgTable('receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),

  fileName: text('file_name').notNull(),
  fileUrl: text('file_url').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),

  ocrResult: jsonb('ocr_result'),

  source: text('source').notNull().default('upload'),
  sourceId: text('source_id'),

  verificationStatus: text('verification_status').notNull().default('pending'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * 审批记录表
 */
export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  reimbursementId: uuid('reimbursement_id')
    .notNull()
    .references(() => reimbursements.id),
  approverId: uuid('approver_id')
    .notNull()
    .references(() => users.id),

  action: text('action').notNull(), // approve, reject, request_change
  comment: text('comment'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * 支付记录表
 */
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  reimbursementId: uuid('reimbursement_id')
    .notNull()
    .references(() => reimbursements.id),

  amount: real('amount').notNull(),
  currency: text('currency').notNull(),

  transactionId: text('transaction_id'),
  paymentProvider: text('payment_provider').notNull().default('fluxpay'),

  status: text('status').notNull().default('pending'),
  errorMessage: text('error_message'),

  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * 报销政策表
 */
export const policies = pgTable('policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),

  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  priority: integer('priority').notNull().default(0),

  rules: jsonb('rules').notNull().default([]),
  completenessCheck: jsonb('completeness_check'),

  createdVia: text('created_via').notNull().default('ui'),
  createdByPrompt: text('created_by_prompt'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * 审计日志表
 */
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  userId: uuid('user_id').references(() => users.id),

  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),

  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  metadata: jsonb('metadata'),

  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Skills 表
 */
export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),

  name: text('name').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  icon: text('icon'),
  version: text('version').notNull().default('1.0.0'),
  author: text('author'),

  triggers: jsonb('triggers').notNull().default([]),
  executor: jsonb('executor').notNull(),

  inputSchema: jsonb('input_schema'),
  outputSchema: jsonb('output_schema'),

  permissions: jsonb('permissions').notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  isBuiltIn: boolean('is_built_in').notNull().default(false),

  config: jsonb('config'),
  configSchema: jsonb('config_schema'),

  stats: jsonb('stats'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Skill 执行日志表
 */
export const skillExecutionLogs = pgTable('skill_execution_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  skillId: uuid('skill_id')
    .notNull()
    .references(() => skills.id),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  userId: uuid('user_id').references(() => users.id),

  trigger: text('trigger').notNull(),
  success: boolean('success').notNull(),
  executionTime: integer('execution_time').notNull(), // 毫秒

  input: jsonb('input'),
  output: jsonb('output'),
  error: jsonb('error'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ============================================================================
// Relations
// ============================================================================

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  trips: many(trips),
  reimbursements: many(reimbursements),
  policies: many(policies),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  manager: one(users, {
    fields: [users.managerId],
    references: [users.id],
  }),
  trips: many(trips),
  reimbursements: many(reimbursements),
  receipts: many(receipts),
}));

export const tripsRelations = relations(trips, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [trips.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [trips.userId],
    references: [users.id],
  }),
  reimbursements: many(reimbursements),
}));

export const reimbursementsRelations = relations(reimbursements, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [reimbursements.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [reimbursements.userId],
    references: [users.id],
  }),
  trip: one(trips, {
    fields: [reimbursements.tripId],
    references: [trips.id],
  }),
  items: many(reimbursementItems),
  approvals: many(approvals),
  payments: many(payments),
}));

export const reimbursementItemsRelations = relations(reimbursementItems, ({ one }) => ({
  reimbursement: one(reimbursements, {
    fields: [reimbursementItems.reimbursementId],
    references: [reimbursements.id],
  }),
}));
