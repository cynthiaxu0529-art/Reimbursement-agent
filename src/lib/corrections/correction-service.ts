/**
 * 费用冲差服务
 *
 * 当已付款的报销单存在错误时，财务可以标记错误并创建冲差记录。
 * 冲差金额会在该员工的后续报销中自动抵扣，直到差额归零。
 *
 * 核心流程：
 * 1. 财务标记错误 → 创建 expenseCorrections 记录
 * 2. 该员工提交新报销并审批通过 → 查询是否有待冲差
 * 3. 有待冲差 → 计算抵扣金额，调整实际打款 → 记录 correctionApplications
 * 4. 所有差额冲完 → correction 状态变为 settled
 */

import { db } from '@/lib/db';
import {
  expenseCorrections,
  correctionApplications,
  reimbursements,
  users,
} from '@/lib/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';

// ============================================================================
// 类型定义
// ============================================================================

export interface CreateCorrectionInput {
  tenantId: string;
  originalReimbursementId: string;
  correctedAmount: number;
  reason: string;
  correctionNote?: string;
  errorCategory?: string;
  flaggedBy: string;
}

export interface ApplyCorrectionInput {
  correctionId: string;
  targetReimbursementId: string;
  appliedAmount: number;
  note?: string;
  appliedBy: string;
}

export interface CorrectionSummary {
  id: string;
  originalReimbursementId: string;
  originalReimbursementTitle: string;
  employeeId: string;
  employeeName: string;
  originalPaidAmount: number;
  correctedAmount: number;
  differenceAmount: number;
  appliedAmount: number;
  remainingAmount: number;
  status: string;
  reason: string;
  errorCategory: string | null;
  flaggedAt: Date;
  applications: {
    id: string;
    targetReimbursementId: string;
    targetReimbursementTitle: string;
    appliedAmount: number;
    originalPaymentAmount: number;
    adjustedPaymentAmount: number;
    appliedAt: Date;
  }[];
}

// ============================================================================
// 创建冲差记录
// ============================================================================

/**
 * 财务标记错误报销并创建冲差记录
 */
export async function createCorrection(input: CreateCorrectionInput) {
  // 1. 获取原报销单
  const [reimbursement] = await db
    .select()
    .from(reimbursements)
    .where(
      and(
        eq(reimbursements.id, input.originalReimbursementId),
        eq(reimbursements.tenantId, input.tenantId)
      )
    )
    .limit(1);

  if (!reimbursement) {
    throw new Error('报销单不存在');
  }

  if (reimbursement.status !== 'paid') {
    throw new Error('只能对已付款的报销单创建冲差记录');
  }

  // 2. 计算差额
  const originalPaidAmount = reimbursement.totalAmountInBaseCurrency || reimbursement.totalAmount;
  const differenceAmount = Number((originalPaidAmount - input.correctedAmount).toFixed(2));

  if (differenceAmount === 0) {
    throw new Error('正确金额与已付金额相同，无需冲差');
  }

  // 3. 检查是否已有未完成的冲差记录
  const existingCorrections = await db
    .select()
    .from(expenseCorrections)
    .where(
      and(
        eq(expenseCorrections.originalReimbursementId, input.originalReimbursementId),
        inArray(expenseCorrections.status, ['pending', 'partial'])
      )
    );

  if (existingCorrections.length > 0) {
    throw new Error('该报销单已存在未完成的冲差记录');
  }

  // 4. 创建冲差记录
  const [correction] = await db
    .insert(expenseCorrections)
    .values({
      tenantId: input.tenantId,
      originalReimbursementId: input.originalReimbursementId,
      employeeId: reimbursement.userId,
      originalPaidAmount,
      correctedAmount: input.correctedAmount,
      differenceAmount,
      currency: reimbursement.baseCurrency || 'USD',
      appliedAmount: 0,
      remainingAmount: Math.abs(differenceAmount),
      status: 'pending',
      reason: input.reason,
      correctionNote: input.correctionNote,
      errorCategory: input.errorCategory,
      flaggedBy: input.flaggedBy,
    })
    .returning();

  return correction;
}

// ============================================================================
// 应用冲差（从新报销中抵扣）
// ============================================================================

/**
 * 将冲差金额应用到新的报销单
 *
 * @returns 抵扣记录 + 更新后的冲差状态
 */
export async function applyCorrection(input: ApplyCorrectionInput) {
  // 1. 获取冲差记录
  const [correction] = await db
    .select()
    .from(expenseCorrections)
    .where(eq(expenseCorrections.id, input.correctionId))
    .limit(1);

  if (!correction) {
    throw new Error('冲差记录不存在');
  }

  if (correction.status === 'settled') {
    throw new Error('该冲差已完成');
  }

  if (correction.status === 'cancelled') {
    throw new Error('该冲差已取消');
  }

  // 2. 获取目标报销单
  const [targetReimb] = await db
    .select()
    .from(reimbursements)
    .where(
      and(
        eq(reimbursements.id, input.targetReimbursementId),
        eq(reimbursements.tenantId, correction.tenantId)
      )
    )
    .limit(1);

  if (!targetReimb) {
    throw new Error('目标报销单不存在');
  }

  if (targetReimb.status !== 'approved') {
    throw new Error('只能对已审批的报销单应用冲差');
  }

  // 目标报销单必须属于同一员工
  if (targetReimb.userId !== correction.employeeId) {
    throw new Error('目标报销单的提交人与冲差记录的员工不一致');
  }

  // 3. 验证抵扣金额
  const appliedAmount = Number(input.appliedAmount.toFixed(2));

  if (appliedAmount <= 0) {
    throw new Error('抵扣金额必须大于 0');
  }

  if (appliedAmount > correction.remainingAmount) {
    throw new Error(`抵扣金额不能超过剩余待冲差金额 ${correction.remainingAmount}`);
  }

  const targetOriginalAmount = targetReimb.totalAmountInBaseCurrency || targetReimb.totalAmount;

  // 多付情况：抵扣金额不能超过目标报销的应付金额
  if (correction.differenceAmount > 0 && appliedAmount > targetOriginalAmount) {
    throw new Error(`抵扣金额不能超过目标报销金额 ${targetOriginalAmount}`);
  }

  // 4. 计算调整后的打款金额
  let adjustedPaymentAmount: number;
  if (correction.differenceAmount > 0) {
    // 多付了 → 从新报销中扣减
    adjustedPaymentAmount = Number((targetOriginalAmount - appliedAmount).toFixed(2));
  } else {
    // 少付了 → 在新报销中追加
    adjustedPaymentAmount = Number((targetOriginalAmount + appliedAmount).toFixed(2));
  }

  // 5. 创建抵扣记录
  const [application] = await db
    .insert(correctionApplications)
    .values({
      correctionId: input.correctionId,
      targetReimbursementId: input.targetReimbursementId,
      appliedAmount,
      currency: correction.currency,
      originalPaymentAmount: targetOriginalAmount,
      adjustedPaymentAmount,
      note: input.note,
      appliedBy: input.appliedBy,
    })
    .returning();

  // 6. 更新冲差记录
  const newAppliedAmount = Number((correction.appliedAmount + appliedAmount).toFixed(2));
  const newRemainingAmount = Number((correction.remainingAmount - appliedAmount).toFixed(2));
  const newStatus = newRemainingAmount <= 0 ? 'settled' : 'partial';

  await db
    .update(expenseCorrections)
    .set({
      appliedAmount: newAppliedAmount,
      remainingAmount: Math.max(0, newRemainingAmount),
      status: newStatus,
      settledAt: newStatus === 'settled' ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(expenseCorrections.id, input.correctionId));

  // 7. 在目标报销单的 aiSuggestions 中记录冲差信息
  const existingSuggestions = (targetReimb.aiSuggestions as any[]) || [];
  const filteredSuggestions = existingSuggestions.filter(
    (s: any) => !(s.type === 'correction_applied' && s.correctionId === input.correctionId)
  );
  filteredSuggestions.push({
    type: 'correction_applied',
    correctionId: input.correctionId,
    appliedAmount,
    adjustedPaymentAmount,
    originalPaymentAmount: targetOriginalAmount,
    direction: correction.differenceAmount > 0 ? 'deduct' : 'supplement',
    appliedAt: new Date().toISOString(),
  });

  await db
    .update(reimbursements)
    .set({
      aiSuggestions: filteredSuggestions,
      updatedAt: new Date(),
    })
    .where(eq(reimbursements.id, input.targetReimbursementId));

  return {
    application,
    correctionStatus: newStatus,
    remainingAmount: Math.max(0, newRemainingAmount),
    adjustedPaymentAmount,
  };
}

// ============================================================================
// 查询功能
// ============================================================================

/**
 * 获取员工的待冲差记录
 */
export async function getPendingCorrectionsForEmployee(
  tenantId: string,
  employeeId: string
) {
  return db
    .select()
    .from(expenseCorrections)
    .where(
      and(
        eq(expenseCorrections.tenantId, tenantId),
        eq(expenseCorrections.employeeId, employeeId),
        inArray(expenseCorrections.status, ['pending', 'partial'])
      )
    );
}

/**
 * 获取租户的所有冲差记录（财务视图）
 */
export async function listCorrections(
  tenantId: string,
  options?: { status?: string; employeeId?: string }
) {
  const conditions = [eq(expenseCorrections.tenantId, tenantId)];

  if (options?.status) {
    conditions.push(eq(expenseCorrections.status, options.status as any));
  }
  if (options?.employeeId) {
    conditions.push(eq(expenseCorrections.employeeId, options.employeeId));
  }

  const corrections = await db
    .select({
      correction: expenseCorrections,
      employeeName: users.name,
      reimbursementTitle: reimbursements.title,
    })
    .from(expenseCorrections)
    .leftJoin(users, eq(expenseCorrections.employeeId, users.id))
    .leftJoin(reimbursements, eq(expenseCorrections.originalReimbursementId, reimbursements.id))
    .where(and(...conditions))
    .orderBy(sql`${expenseCorrections.createdAt} desc`);

  return corrections.map((row: { correction: typeof expenseCorrections.$inferSelect; employeeName: string | null; reimbursementTitle: string | null }) => ({
    ...row.correction,
    employeeName: row.employeeName || '未知',
    originalReimbursementTitle: row.reimbursementTitle || '未知',
  }));
}

/**
 * 获取冲差详情（含抵扣记录）
 */
export async function getCorrectionDetail(correctionId: string): Promise<CorrectionSummary | null> {
  const [correction] = await db
    .select({
      correction: expenseCorrections,
      employeeName: users.name,
      reimbursementTitle: reimbursements.title,
    })
    .from(expenseCorrections)
    .leftJoin(users, eq(expenseCorrections.employeeId, users.id))
    .leftJoin(reimbursements, eq(expenseCorrections.originalReimbursementId, reimbursements.id))
    .where(eq(expenseCorrections.id, correctionId))
    .limit(1);

  if (!correction) return null;

  // 获取抵扣记录
  const applications = await db
    .select({
      application: correctionApplications,
      targetTitle: reimbursements.title,
    })
    .from(correctionApplications)
    .leftJoin(reimbursements, eq(correctionApplications.targetReimbursementId, reimbursements.id))
    .where(eq(correctionApplications.correctionId, correctionId))
    .orderBy(sql`${correctionApplications.appliedAt} asc`);

  return {
    id: correction.correction.id,
    originalReimbursementId: correction.correction.originalReimbursementId,
    originalReimbursementTitle: correction.reimbursementTitle || '未知',
    employeeId: correction.correction.employeeId,
    employeeName: correction.employeeName || '未知',
    originalPaidAmount: correction.correction.originalPaidAmount,
    correctedAmount: correction.correction.correctedAmount,
    differenceAmount: correction.correction.differenceAmount,
    appliedAmount: correction.correction.appliedAmount,
    remainingAmount: correction.correction.remainingAmount,
    status: correction.correction.status,
    reason: correction.correction.reason,
    errorCategory: correction.correction.errorCategory,
    flaggedAt: correction.correction.flaggedAt,
    applications: applications.map((a: { application: typeof correctionApplications.$inferSelect; targetTitle: string | null }) => ({
      id: a.application.id,
      targetReimbursementId: a.application.targetReimbursementId,
      targetReimbursementTitle: a.targetTitle || '未知',
      appliedAmount: a.application.appliedAmount,
      originalPaymentAmount: a.application.originalPaymentAmount,
      adjustedPaymentAmount: a.application.adjustedPaymentAmount,
      appliedAt: a.application.appliedAt,
    })),
  };
}

/**
 * 取消冲差记录
 */
export async function cancelCorrection(
  correctionId: string,
  cancelReason: string
) {
  const [correction] = await db
    .select()
    .from(expenseCorrections)
    .where(eq(expenseCorrections.id, correctionId))
    .limit(1);

  if (!correction) {
    throw new Error('冲差记录不存在');
  }

  if (correction.status === 'settled') {
    throw new Error('已完成的冲差记录不能取消');
  }

  if (correction.status === 'cancelled') {
    throw new Error('该冲差已取消');
  }

  if (correction.appliedAmount > 0) {
    throw new Error('已部分抵扣的冲差记录不能取消，请联系管理员处理');
  }

  await db
    .update(expenseCorrections)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelReason,
      updatedAt: new Date(),
    })
    .where(eq(expenseCorrections.id, correctionId));

  return { success: true };
}

/**
 * 计算报销单的建议打款金额（考虑冲差抵扣）
 *
 * 当某员工有待冲差记录，其新报销审批通过后，
 * 此函数返回建议的实际打款金额。
 */
export async function calculateAdjustedPaymentAmount(
  tenantId: string,
  reimbursementId: string
): Promise<{
  originalAmount: number;
  adjustedAmount: number;
  corrections: {
    correctionId: string;
    suggestedDeduction: number;
    remainingAmount: number;
    reason: string;
  }[];
}> {
  const [reimbursement] = await db
    .select()
    .from(reimbursements)
    .where(
      and(
        eq(reimbursements.id, reimbursementId),
        eq(reimbursements.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!reimbursement) {
    throw new Error('报销单不存在');
  }

  const originalAmount = reimbursement.totalAmountInBaseCurrency || reimbursement.totalAmount;

  // 查询该员工的待冲差记录
  const pendingCorrections = await getPendingCorrectionsForEmployee(
    tenantId,
    reimbursement.userId
  );

  if (pendingCorrections.length === 0) {
    return {
      originalAmount,
      adjustedAmount: originalAmount,
      corrections: [],
    };
  }

  let adjustedAmount = originalAmount;
  const correctionDetails: {
    correctionId: string;
    suggestedDeduction: number;
    remainingAmount: number;
    reason: string;
  }[] = [];

  for (const correction of pendingCorrections) {
    if (correction.differenceAmount > 0) {
      // 多付了 → 从当前报销中扣减
      const deduction = Math.min(correction.remainingAmount, adjustedAmount);
      adjustedAmount = Number((adjustedAmount - deduction).toFixed(2));
      correctionDetails.push({
        correctionId: correction.id,
        suggestedDeduction: deduction,
        remainingAmount: correction.remainingAmount,
        reason: correction.reason,
      });
    } else {
      // 少付了 → 追加到当前报销
      const supplement = correction.remainingAmount;
      adjustedAmount = Number((adjustedAmount + supplement).toFixed(2));
      correctionDetails.push({
        correctionId: correction.id,
        suggestedDeduction: -supplement,
        remainingAmount: correction.remainingAmount,
        reason: correction.reason,
      });
    }
  }

  return {
    originalAmount,
    adjustedAmount,
    corrections: correctionDetails,
  };
}
