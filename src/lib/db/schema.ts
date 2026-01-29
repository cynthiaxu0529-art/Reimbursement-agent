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

export const approvalStepStatusEnum = pgEnum('approval_step_status', [
  'pending',      // 待审批
  'approved',     // 已通过
  'rejected',     // 已拒绝
  'skipped',      // 跳过（如直属上级与部门审批人是同一人）
]);

export const invitationStatusEnum = pgEnum('invitation_status', [
  'pending',      // 待接受
  'accepted',     // 已接受
  'expired',      // 已过期
  'revoked',      // 已撤销
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
 * 部门表
 * 支持多级部门结构
 */
export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  name: text('name').notNull(),
  code: text('code'),                             // 部门编码，如 TECH-001
  description: text('description'),
  parentId: uuid('parent_id'),                    // 上级部门，为空表示顶级部门
  managerId: uuid('manager_id'),                  // 部门负责人
  approverIds: jsonb('approver_ids').default([]), // 部门审批人列表（UUID数组）
  level: integer('level').notNull().default(1),   // 部门层级，1为顶级
  sortOrder: integer('sort_order').notNull().default(0), // 排序顺序
  isActive: boolean('is_active').notNull().default(true),
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
  role: userRoleEnum('role').notNull().default('employee'), // 用户角色
  // roles: jsonb('roles').default(['employee']),           // 多角色数组 - 需要先运行数据库迁移
  department: text('department'),                 // 旧字段，保留兼容
  departmentId: uuid('department_id'),            // 新字段：关联部门表
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
 * 邀请表
 * 用于安全的邀请注册流程
 */
export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  name: text('name'),                               // 被邀请人姓名（可选）
  roles: jsonb('roles').notNull().default(['employee']), // 邀请角色数组
  departmentId: uuid('department_id')
    .references(() => departments.id, { onDelete: 'set null' }),
  setAsDeptManager: boolean('set_as_dept_manager').notNull().default(false),

  // Token安全
  tokenHash: text('token_hash').notNull().unique(), // 存储token的SHA-256哈希值
  expiresAt: timestamp('expires_at').notNull(),     // 过期时间

  // 状态跟踪
  status: invitationStatusEnum('status').notNull().default('pending'),
  acceptedAt: timestamp('accepted_at'),             // 接受时间
  acceptedByUserId: uuid('accepted_by_user_id')
    .references(() => users.id, { onDelete: 'set null' }),

  // 审计字段
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  revokedBy: uuid('revoked_by')
    .references(() => users.id, { onDelete: 'set null' }),
  revokedAt: timestamp('revoked_at'),
  revokeReason: text('revoke_reason'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
 * 审批链表
 * 记录报销单的多级审批流程
 */
export const approvalChain = pgTable('approval_chain', {
  id: uuid('id').primaryKey().defaultRandom(),
  reimbursementId: uuid('reimbursement_id')
    .notNull()
    .references(() => reimbursements.id),

  stepOrder: integer('step_order').notNull(),     // 步骤顺序，从1开始
  stepType: text('step_type').notNull(),          // 步骤类型: manager, department, finance, amount_threshold
  stepName: text('step_name').notNull(),          // 步骤名称，如"直属上级审批"

  approverId: uuid('approver_id')                 // 审批人ID
    .references(() => users.id),
  approverRole: text('approver_role'),            // 审批人角色
  departmentId: uuid('department_id'),            // 关联部门（如部门负责人审批）

  status: approvalStepStatusEnum('status').notNull().default('pending'),
  comment: text('comment'),                       // 审批意见

  amountThreshold: real('amount_threshold'),      // 金额阈值（用于金额触发的审批）

  assignedAt: timestamp('assigned_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * 审批规则表
 * 定义不同条件下的审批流程
 */
export const approvalRules = pgTable('approval_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),

  name: text('name').notNull(),                   // 规则名称
  description: text('description'),
  priority: integer('priority').notNull().default(0), // 优先级，数字越小优先级越高

  // 触发条件
  conditions: jsonb('conditions').notNull().default({}),
  // 条件结构示例:
  // {
  //   minAmount: 5000,      // 最小金额
  //   maxAmount: 50000,     // 最大金额
  //   categories: ['flight', 'hotel'], // 适用类别
  //   departments: ['uuid1', 'uuid2'], // 适用部门
  // }

  // 审批链配置
  approvalSteps: jsonb('approval_steps').notNull().default([]),
  // 审批步骤结构示例:
  // [
  //   { order: 1, type: 'manager', name: '直属上级' },
  //   { order: 2, type: 'department', name: '部门负责人' },
  //   { order: 3, type: 'role', role: 'finance', name: '财务审核' },
  // ]

  isActive: boolean('is_active').notNull().default(true),
  isDefault: boolean('is_default').notNull().default(false), // 是否为默认规则

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
  paymentProvider: text('payment_provider').notNull().default('fluxa'),

  status: text('status').notNull().default('pending'),
  errorMessage: text('error_message'),

  // Fluxa Payout 相关字段
  payoutId: text('payout_id'),                    // Fluxa payout ID
  approvalUrl: text('approval_url'),              // 财务审批 URL
  payoutStatus: text('payout_status'),            // Fluxa 状态: pending_authorization, authorized, signed, broadcasting, succeeded, failed, expired
  txHash: text('tx_hash'),                        // 区块链交易哈希
  expiresAt: timestamp('expires_at'),             // 审批过期时间
  toAddress: text('to_address'),                  // 收款钱包地址
  initiatedBy: uuid('initiated_by'),              // 发起人 ID

  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
  departments: many(departments),
  trips: many(trips),
  reimbursements: many(reimbursements),
  policies: many(policies),
  approvalRules: many(approvalRules),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  departmentRef: one(departments, {
    fields: [users.departmentId],
    references: [departments.id],
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
  approvalChain: many(approvalChain),
  payments: many(payments),
}));

export const reimbursementItemsRelations = relations(reimbursementItems, ({ one }) => ({
  reimbursement: one(reimbursements, {
    fields: [reimbursementItems.reimbursementId],
    references: [reimbursements.id],
  }),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [departments.tenantId],
    references: [tenants.id],
  }),
  parent: one(departments, {
    fields: [departments.parentId],
    references: [departments.id],
    relationName: 'parentChild',
  }),
  children: many(departments, { relationName: 'parentChild' }),
  manager: one(users, {
    fields: [departments.managerId],
    references: [users.id],
  }),
  members: many(users),
}));

export const approvalChainRelations = relations(approvalChain, ({ one }) => ({
  reimbursement: one(reimbursements, {
    fields: [approvalChain.reimbursementId],
    references: [reimbursements.id],
  }),
  approver: one(users, {
    fields: [approvalChain.approverId],
    references: [users.id],
  }),
  department: one(departments, {
    fields: [approvalChain.departmentId],
    references: [departments.id],
  }),
}));

export const approvalRulesRelations = relations(approvalRules, ({ one }) => ({
  tenant: one(tenants, {
    fields: [approvalRules.tenantId],
    references: [tenants.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  tenant: one(tenants, {
    fields: [invitations.tenantId],
    references: [tenants.id],
  }),
  department: one(departments, {
    fields: [invitations.departmentId],
    references: [departments.id],
  }),
  createdByUser: one(users, {
    fields: [invitations.createdBy],
    references: [users.id],
    relationName: 'createdInvitations',
  }),
  acceptedByUser: one(users, {
    fields: [invitations.acceptedByUserId],
    references: [users.id],
    relationName: 'acceptedInvitation',
  }),
  revokedByUser: one(users, {
    fields: [invitations.revokedBy],
    references: [users.id],
    relationName: 'revokedInvitations',
  }),
}));
