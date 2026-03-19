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
  index,
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

export const itineraryStatusEnum = pgEnum('itinerary_status', [
  'draft',          // AI 生成的草稿
  'confirmed',      // 用户确认
  'modified',       // 用户修改后
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
  baseCurrency: text('base_currency').notNull().default('USD'),
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
  costCenter: text('cost_center'),                // 费用性质：rd=研发费用, sm=销售费用, ga=管理费用（默认）
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
  role: userRoleEnum('role').notNull().default('employee'), // 主要角色（保留兼容）
  roles: jsonb('roles').$type<string[]>().default(['employee']), // 多角色数组
  department: text('department'),                 // 旧字段，保留兼容
  departmentId: uuid('department_id'),            // 新字段：关联部门表
  managerId: uuid('manager_id'),
  bankAccount: jsonb('bank_account'),
  preferences: jsonb('preferences').default({}),
  telegramChatId: text('telegram_chat_id'),          // Telegram Chat ID，用于发送审批提醒
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
 * 行程单表（从报销内容智能生成的行程）
 */
export const tripItineraries = pgTable('trip_itineraries', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  reimbursementId: uuid('reimbursement_id'),         // 关联的报销单（提交后关联）
  tripId: uuid('trip_id')
    .references(() => trips.id),                      // 可选：关联已有行程

  title: text('title').notNull(),                     // 行程标题，如"上海-北京出差"
  purpose: text('purpose'),                           // 出差目的
  startDate: timestamp('start_date'),                 // 行程开始日期
  endDate: timestamp('end_date'),                     // 行程结束日期
  destinations: jsonb('destinations').default([]),     // 目的地列表

  status: itineraryStatusEnum('status').notNull().default('draft'),
  aiGenerated: boolean('ai_generated').notNull().default(true), // 是否AI生成

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * 行程明细表（行程中的每个节点/事件）
 */
export const tripItineraryItems = pgTable('trip_itinerary_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  itineraryId: uuid('itinerary_id')
    .notNull()
    .references(() => tripItineraries.id, { onDelete: 'cascade' }),

  date: timestamp('date').notNull(),                   // 日期
  time: text('time'),                                  // 时间（可选，如 "08:00"）
  type: text('type').notNull(),                        // 类型: transport, hotel, meal, meeting, other
  category: text('category'),                          // 对应报销类别: flight, train, hotel, meal, taxi
  title: text('title').notNull(),                      // 标题，如"北京→上海 G102"
  description: text('description'),                    // 详细描述
  location: text('location'),                          // 地点

  // 交通信息
  departure: text('departure'),                        // 出发地
  arrival: text('arrival'),                            // 到达地
  transportNumber: text('transport_number'),            // 车次/航班号

  // 住宿信息
  hotelName: text('hotel_name'),
  checkIn: timestamp('check_in'),
  checkOut: timestamp('check_out'),

  // 费用关联
  amount: real('amount'),                              // 关联金额
  currency: text('currency'),                          // 币种
  reimbursementItemId: uuid('reimbursement_item_id'),  // 关联的报销明细ID
  receiptUrl: text('receipt_url'),                     // 关联的票据URL

  sortOrder: integer('sort_order').notNull().default(0), // 排序顺序

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
  baseCurrency: text('base_currency').notNull().default('USD'),

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
 * 预借款表
 * 员工申请预借款，后续提交凭证核销
 */
export const advances = pgTable('advances', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),

  title: text('title').notNull(),
  description: text('description'),
  purpose: text('purpose'),                          // 预借款用途

  amount: real('amount').notNull(),
  currency: text('currency').notNull().default('USD'),

  // 状态: pending(待审批), approved(已批准), paid(已打款), reconciling(核销中), reconciled(已核销), rejected(已拒绝), cancelled(已取消)
  status: text('status').notNull().default('pending'),

  // 审批
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  rejectedBy: uuid('rejected_by').references(() => users.id),
  rejectedAt: timestamp('rejected_at'),
  rejectReason: text('reject_reason'),

  // 打款
  paidAt: timestamp('paid_at'),
  paymentId: text('payment_id'),                     // 关联支付记录

  // 核销
  reconciledAmount: real('reconciled_amount').default(0),  // 已核销金额
  reconciledAt: timestamp('reconciled_at'),
  reconciliationNote: text('reconciliation_note'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * 预借款核销记录表
 * 记录预借款与报销单的关联核销
 */
export const advanceReconciliations = pgTable('advance_reconciliations', {
  id: uuid('id').primaryKey().defaultRandom(),
  advanceId: uuid('advance_id')
    .notNull()
    .references(() => advances.id),
  reimbursementId: uuid('reimbursement_id')
    .notNull()
    .references(() => reimbursements.id),

  amount: real('amount').notNull(),                  // 核销金额
  note: text('note'),

  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
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
  itineraries: many(tripItineraries),
}));

export const tripItinerariesRelations = relations(tripItineraries, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [tripItineraries.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [tripItineraries.userId],
    references: [users.id],
  }),
  trip: one(trips, {
    fields: [tripItineraries.tripId],
    references: [trips.id],
  }),
  items: many(tripItineraryItems),
}));

export const tripItineraryItemsRelations = relations(tripItineraryItems, ({ one }) => ({
  itinerary: one(tripItineraries, {
    fields: [tripItineraryItems.itineraryId],
    references: [tripItineraries.id],
  }),
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

export const advancesRelations = relations(advances, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [advances.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [advances.userId],
    references: [users.id],
  }),
  reconciliations: many(advanceReconciliations),
}));

export const advanceReconciliationsRelations = relations(advanceReconciliations, ({ one }) => ({
  advance: one(advances, {
    fields: [advanceReconciliations.advanceId],
    references: [advances.id],
  }),
  reimbursement: one(reimbursements, {
    fields: [advanceReconciliations.reimbursementId],
    references: [reimbursements.id],
  }),
  createdByUser: one(users, {
    fields: [advanceReconciliations.createdBy],
    references: [users.id],
  }),
}));

// ============================================================================
// API Key 表（OpenClaw / M2M 集成）
// ============================================================================

/**
 * API Key 表
 * 支持外部 AI Agent（如 OpenClaw）以用户身份调用 API
 *
 * 设计原则：
 * 1. 每个 API Key 绑定一个用户，代表该用户执行操作
 * 2. 通过 scopes 控制 Agent 可执行的操作范围
 * 3. 只存储 key 的 SHA-256 哈希，不存储明文
 * 4. 支持过期时间和手动撤销
 * 5. 内置速率限制配置
 */
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Key 标识
  name: text('name').notNull(),                      // 用户自定义名称，如 "我的 OpenClaw Agent"
  keyPrefix: text('key_prefix').notNull(),            // Key 前缀用于展示，如 "rk_a1b2c3..."
  keyHash: text('key_hash').notNull().unique(),       // SHA-256 哈希值

  // 权限范围
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),

  // Agent 元数据
  agentType: text('agent_type'),                      // 'openclaw' | 'custom' | ...
  agentMetadata: jsonb('agent_metadata'),             // Agent 的额外信息

  // 速率限制
  rateLimitPerMinute: integer('rate_limit_per_minute').notNull().default(60),
  rateLimitPerDay: integer('rate_limit_per_day').notNull().default(1000),

  // 金额限制（Agent 安全防护）
  maxAmountPerRequest: real('max_amount_per_request'),  // 单次报销最大金额
  maxAmountPerDay: real('max_amount_per_day'),          // 每日报销最大总金额

  // 状态管理
  isActive: boolean('is_active').notNull().default(true),
  expiresAt: timestamp('expires_at'),                   // 可选的过期时间
  lastUsedAt: timestamp('last_used_at'),
  usageCount: integer('usage_count').notNull().default(0),

  // 撤销信息
  revokedAt: timestamp('revoked_at'),
  revokedBy: uuid('revoked_by').references(() => users.id),
  revokeReason: text('revoke_reason'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  // 认证时通过 keyHash 查找（核心热路径）
  // keyHash 已有 unique 约束会自动创建索引，这里显式声明便于可读性
  // 按用户列出其 API Keys
  index('idx_api_keys_user').on(table.userId, table.tenantId),
]);

/**
 * Agent 操作审计日志
 * 记录所有通过 API Key 执行的操作，便于审计和追踪
 */
export const agentAuditLogs = pgTable('agent_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  apiKeyId: uuid('api_key_id')
    .notNull()
    .references(() => apiKeys.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),

  // 操作信息
  action: text('action').notNull(),                   // 'reimbursement:create', 'reimbursement:read' 等
  method: text('method').notNull(),                   // HTTP method: GET, POST, PUT, DELETE
  path: text('path').notNull(),                       // 请求路径
  statusCode: integer('status_code'),                 // 响应状态码

  // Agent 信息
  agentType: text('agent_type'),                      // 'openclaw', 'custom' 等
  agentVersion: text('agent_version'),                // Agent 版本号

  // 请求/响应摘要
  requestSummary: jsonb('request_summary'),            // 请求关键参数（脱敏）
  responseSummary: jsonb('response_summary'),           // 响应摘要

  // 资源信息
  entityType: text('entity_type'),                     // 'reimbursement', 'receipt' 等
  entityId: uuid('entity_id'),                         // 关联的资源 ID

  // 元数据
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  durationMs: integer('duration_ms'),                  // 请求耗时

  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  // 按租户+时间倒序查询（管理员全局视图的核心查询路径）
  index('idx_agent_audit_tenant_created').on(table.tenantId, table.createdAt),
  // 按 API Key 查询（某个 Key 的操作历史）
  index('idx_agent_audit_apikey').on(table.apiKeyId, table.createdAt),
  // 按用户查询（某个用户的所有 Agent 操作）
  index('idx_agent_audit_user').on(table.userId, table.createdAt),
  // 按操作类型筛选
  index('idx_agent_audit_action').on(table.tenantId, table.action, table.createdAt),
  // 按 Agent 类型筛选
  index('idx_agent_audit_agent_type').on(table.tenantId, table.agentType, table.createdAt),
]);

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [apiKeys.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
  auditLogs: many(agentAuditLogs),
}));

export const agentAuditLogsRelations = relations(agentAuditLogs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [agentAuditLogs.tenantId],
    references: [tenants.id],
  }),
  apiKey: one(apiKeys, {
    fields: [agentAuditLogs.apiKeyId],
    references: [apiKeys.id],
  }),
  user: one(users, {
    fields: [agentAuditLogs.userId],
    references: [users.id],
  }),
}));

// ============================================================================
// 汇率相关表
// ============================================================================

/**
 * 月初固定汇率表
 * 每月月初记录一次汇率，用于当月所有报销的汇率计算
 * 避免汇率波动导致的计算差异
 */
export const monthlyExchangeRates = pgTable('monthly_exchange_rates', {
  id: uuid('id').primaryKey().defaultRandom(),

  // 年月标识（格式：2024-01）
  yearMonth: text('year_month').notNull(),

  // 货币对
  fromCurrency: text('from_currency').notNull(),
  toCurrency: text('to_currency').notNull(),

  // 汇率
  rate: real('rate').notNull(),

  // 数据来源
  source: text('source').notNull().default('api'), // 'api' | 'manual' | 'central_bank'

  // 记录时间（月初第一天的汇率）
  rateDate: timestamp('rate_date').notNull(),

  // 审计字段
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
});

/**
 * 汇率缓存表
 * 用于持久化汇率缓存，避免服务重启后丢失
 */
export const exchangeRateCache = pgTable('exchange_rate_cache', {
  id: uuid('id').primaryKey().defaultRandom(),

  // 缓存键（格式：USD_CNY）
  cacheKey: text('cache_key').notNull().unique(),

  // 货币对
  fromCurrency: text('from_currency').notNull(),
  toCurrency: text('to_currency').notNull(),

  // 汇率
  rate: real('rate').notNull(),

  // 数据来源
  source: text('source').notNull(),

  // 过期时间
  expiresAt: timestamp('expires_at').notNull(),

  // 创建时间
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * 汇率规则配置表
 * 用于配置汇率获取策略、数据来源和回退规则
 */
export const exchangeRateRules = pgTable('exchange_rate_rules', {
  id: uuid('id').primaryKey().defaultRandom(),

  // 租户（可选，为空表示全局规则）
  tenantId: uuid('tenant_id').references(() => tenants.id),

  // 规则描述
  description: text('description').notNull(),

  // 数据来源: 'central_bank' | 'oanda' | 'reuters' | 'open_exchange' | 'manual' | 'api'
  source: text('source').notNull().default('api'),

  // 覆盖的货币列表（JSON 数组）
  currencies: jsonb('currencies').notNull().default([]),

  // 固定汇率（当 source = 'manual' 时使用）
  fixedRates: jsonb('fixed_rates'),

  // 生效日期
  effectiveFrom: timestamp('effective_from').notNull(),
  effectiveTo: timestamp('effective_to'),

  // 回退规则描述
  fallbackRule: text('fallback_rule'),

  // 状态: 'active' | 'draft' | 'archived'
  status: text('status').notNull().default('draft'),

  // 优先级（数字越小优先级越高）
  priority: integer('priority').notNull().default(0),

  // 审计字段
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================================================
// Service Account 表（系统间 M2M 认证）
// ============================================================================

/**
 * Service Account 表
 * 用于系统间（如 Accounting Agent ↔ Reimbursement Agent）的 API 认证
 *
 * 与 apiKeys 的区别：
 * - apiKeys 绑定到具体用户，代表用户执行操作
 * - serviceAccounts 是系统级身份，不绑定用户，通过 permissions 控制访问
 */
export const serviceAccounts = pgTable('service_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),

  serviceName: text('service_name').notNull().unique(),
  description: text('description'),

  // 认证
  apiKeyHash: text('api_key_hash').notNull().unique(), // bcrypt hash
  keyPrefix: text('key_prefix').notNull(),              // 展示用前缀

  // 权限
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),

  // 状态
  isActive: boolean('is_active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at'),
  usageCount: integer('usage_count').notNull().default(0),

  // 撤销
  revokedAt: timestamp('revoked_at'),
  revokeReason: text('revoke_reason'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================================================
// 同步科目表（从 Accounting Agent 同步）
// ============================================================================

/**
 * 同步的会计科目表
 * 从 Accounting Agent 的 /api/external/chart-of-accounts 同步而来
 */
export const syncedAccounts = pgTable('synced_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),

  accountCode: text('account_code').notNull().unique(),
  accountName: text('account_name').notNull(),
  accountSubtype: text('account_subtype'),

  syncedAt: timestamp('synced_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================================================
// 报销汇总表（供 Accounting Agent 拉取）
// ============================================================================

/**
 * 报销汇总记录
 * 按半月周期 + GL 科目维度汇总已审批报销
 */
export const reimbursementSummaries = pgTable('reimbursement_summaries', {
  id: uuid('id').primaryKey().defaultRandom(),

  summaryId: text('summary_id').notNull().unique(), // REIMB-SUM-YYYYMM-A/B
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),

  // 汇总数据 (JSON)
  items: jsonb('items').notNull().default([]),
  totalAmount: real('total_amount').notNull().default(0),
  totalRecords: integer('total_records').notNull().default(0),
  currency: text('currency').notNull().default('USD'),

  // 同步状态
  isSynced: boolean('is_synced').notNull().default(false),
  syncedAt: timestamp('synced_at'),

  generatedAt: timestamp('generated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
