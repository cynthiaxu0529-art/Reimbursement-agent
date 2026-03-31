/**
 * 汇总生成工具
 *
 * 将已审批/已付款的报销明细按指定半月周期聚合，
 * 并持久化到 reimbursement_summaries 表。
 */

import { db } from '@/lib/db';
import {
  reimbursements,
  reimbursementItems,
  reimbursementSummaries,
  users,
  departments,
  correctionApplications,
  expenseCorrections,
} from '@/lib/db/schema';
import { eq, and, gte, lte, inArray } from 'drizzle-orm';
import { mapExpenseToAccount } from './expense-account-mapping';
import { ensureAccountsSynced } from './chart-of-accounts-sync';

// ============================================================================
// 类型
// ============================================================================

export interface HalfMonthPeriod {
  summaryId: string;
  periodStart: Date;
  periodEnd: Date;
  label: 'A' | 'B';
}

export interface GenerateResult {
  summary_id: string;
  period_start: string;
  period_end: string;
  items: {
    account_code: string;
    account_name: string;
    total_amount: number;
    record_count: number;
    details: {
      employee_name: string;
      amount: number;
      description: string;
    }[];
  }[];
  total_amount: number;
  total_records: number;
  currency: string;
  is_new: boolean; // true = 新生成, false = 已存在被覆盖
}

// ============================================================================
// 半月周期计算
// ============================================================================

export function parseSummaryId(summaryId: string): HalfMonthPeriod | null {
  // REIMB-SUM-202601-B
  const m = summaryId.match(/^REIMB-SUM-(\d{4})(\d{2})-([AB])$/);
  if (!m) return null;

  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1; // 0-based
  const half = m[3] as 'A' | 'B';

  if (half === 'A') {
    return {
      summaryId,
      periodStart: new Date(year, month, 1),
      periodEnd: new Date(year, month, 15, 23, 59, 59, 999),
      label: 'A',
    };
  } else {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return {
      summaryId,
      periodStart: new Date(year, month, 16),
      periodEnd: new Date(year, month, lastDay, 23, 59, 59, 999),
      label: 'B',
    };
  }
}

export function buildSummaryId(year: number, month: number, half: 'A' | 'B'): string {
  return `REIMB-SUM-${year}${String(month).padStart(2, '0')}-${half}`;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * 列出可生成的半月周期（从最早审批日期到今天）
 */
export async function listAvailablePeriods(): Promise<HalfMonthPeriod[]> {
  // 找最早和最晚的审批日期
  const rows = await db
    .select({ approvedAt: reimbursements.approvedAt })
    .from(reimbursements)
    .where(inArray(reimbursements.status, ['approved', 'paid']));

  if (rows.length === 0) return [];

  const dates = rows
    .map(r => r.approvedAt)
    .filter(Boolean)
    .map(d => new Date(d!).getTime());

  if (dates.length === 0) return [];

  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  // 扩展到今天
  const today = new Date();
  const endDate = maxDate > today ? maxDate : today;

  const periods: HalfMonthPeriod[] = [];
  const seen = new Set<string>();

  const current = new Date(minDate);
  while (current <= endDate) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const day = current.getDate();
    const half = day <= 15 ? 'A' : 'B';
    const yearStr = String(year);
    const monthStr = String(month + 1).padStart(2, '0');
    const sid = `REIMB-SUM-${yearStr}${monthStr}-${half}`;

    if (!seen.has(sid)) {
      seen.add(sid);
      if (half === 'A') {
        periods.push({
          summaryId: sid,
          periodStart: new Date(year, month, 1),
          periodEnd: new Date(year, month, 15, 23, 59, 59, 999),
          label: 'A',
        });
      } else {
        const lastDay = new Date(year, month + 1, 0).getDate();
        periods.push({
          summaryId: sid,
          periodStart: new Date(year, month, 16),
          periodEnd: new Date(year, month, lastDay, 23, 59, 59, 999),
          label: 'B',
        });
      }
    }

    // 跳到下半月
    if (day <= 15) {
      current.setDate(16);
    } else {
      current.setMonth(current.getMonth() + 1);
      current.setDate(1);
    }
  }

  return periods;
}

/**
 * 获取已生成（持久化）的汇总 ID 列表
 */
export async function listGeneratedSummaryIds(): Promise<string[]> {
  const rows = await db
    .select({ summaryId: reimbursementSummaries.summaryId })
    .from(reimbursementSummaries);
  return rows.map(r => r.summaryId);
}

// ============================================================================
// 核心生成逻辑
// ============================================================================

/**
 * 为指定半月周期生成并持久化汇总
 *
 * @param summaryId - 如 "REIMB-SUM-202601-B"
 * @returns 生成结果或 null（该期间无数据）
 */
export async function generateAndPersistSummary(summaryId: string): Promise<GenerateResult | null> {
  const period = parseSummaryId(summaryId);
  if (!period) throw new Error(`Invalid summary ID: ${summaryId}`);

  await ensureAccountsSynced();

  // 1. 查询该期间审批通过 + 已付款的报销
  const approvedReimbs = await db
    .select({
      id: reimbursements.id,
      userId: reimbursements.userId,
      approvedAt: reimbursements.approvedAt,
    })
    .from(reimbursements)
    .where(
      and(
        inArray(reimbursements.status, ['approved', 'paid']),
        gte(reimbursements.approvedAt, period.periodStart),
        lte(reimbursements.approvedAt, period.periodEnd),
      )
    );

  if (approvedReimbs.length === 0) return null;

  // 2. 获取报销明细
  const reimbIds = approvedReimbs.map(r => r.id);
  const allItems = await db
    .select()
    .from(reimbursementItems)
    .where(inArray(reimbursementItems.reimbursementId, reimbIds));

  if (allItems.length === 0) return null;

  // 3. 用户 + 部门信息
  const userIds = [...new Set(approvedReimbs.map(r => r.userId))];
  const userRecords = userIds.length > 0
    ? await db.select({ id: users.id, name: users.name, departmentId: users.departmentId, department: users.department }).from(users).where(inArray(users.id, userIds))
    : [];
  const userMap = new Map(userRecords.map(u => [u.id, u.name]));

  const deptIds = [...new Set(userRecords.map(u => u.departmentId).filter(Boolean))] as string[];
  const deptRecords = deptIds.length > 0
    ? await db.select({ id: departments.id, name: departments.name, costCenter: departments.costCenter }).from(departments).where(inArray(departments.id, deptIds))
    : [];
  const deptMap = new Map(deptRecords.map(d => [d.id, { name: d.name, costCenter: d.costCenter }]));

  const userDeptMap = new Map<string, { name: string; costCenter: string | null }>();
  for (const u of userRecords) {
    if (u.departmentId && deptMap.has(u.departmentId)) {
      userDeptMap.set(u.id, deptMap.get(u.departmentId)!);
    } else if (u.department) {
      userDeptMap.set(u.id, { name: u.department, costCenter: null });
    }
  }

  const reimbToUser = new Map(approvedReimbs.map(r => [r.id, r.userId]));

  // 4. 按 account_code 分组
  const groups = new Map<string, {
    accountCode: string;
    accountName: string;
    details: { employee_name: string; amount: number; description: string }[];
    totalAmount: number;
    recordCount: number;
  }>();

  for (const item of allItems) {
    const userId = reimbToUser.get(item.reimbursementId);
    const deptInfo = userId ? userDeptMap.get(userId) : undefined;

    let accountCode = item.coaCode;
    let accountName = item.coaName;
    if (!accountCode) {
      const mapping = await mapExpenseToAccount(item.category, item.description, deptInfo?.costCenter, deptInfo?.name);
      accountCode = mapping.accountCode;
      accountName = mapping.accountName;
    }

    const key = accountCode!;
    if (!groups.has(key)) {
      groups.set(key, {
        accountCode: accountCode!,
        accountName: accountName || '',
        details: [],
        totalAmount: 0,
        recordCount: 0,
      });
    }

    const group = groups.get(key)!;
    const employeeName = userId ? String(userMap.get(userId) || '未知') : '未知';

    group.details.push({
      employee_name: employeeName,
      amount: Number((item.amountInBaseCurrency || item.amount).toFixed(2)),
      description: item.description,
    });
    group.totalAmount += item.amountInBaseCurrency || item.amount;
    group.recordCount += 1;
  }

  // 5. 查询该期间内的冲差抵扣记录，补充调整分录
  const periodApplications = await db
    .select({
      application: correctionApplications,
      correction: expenseCorrections,
    })
    .from(correctionApplications)
    .innerJoin(expenseCorrections, eq(correctionApplications.correctionId, expenseCorrections.id))
    .where(
      and(
        gte(correctionApplications.appliedAt, period.periodStart),
        lte(correctionApplications.appliedAt, period.periodEnd),
      )
    );

  for (const row of periodApplications) {
    const { application, correction } = row;
    // 冲差调整使用特殊科目代码
    const adjustmentCode = '1220'; // 其他应收款 - 冲差调整
    const adjustmentName = correction.differenceAmount > 0
      ? '费用冲差调整（多付扣回）'
      : '费用冲差调整（少付补付）';

    const employeeId = correction.employeeId;
    const employeeName = String(userMap.get(employeeId) || '未知');

    const key = adjustmentCode;
    if (!groups.has(key)) {
      groups.set(key, {
        accountCode: adjustmentCode,
        accountName: adjustmentName,
        details: [],
        totalAmount: 0,
        recordCount: 0,
      });
    }

    const group = groups.get(key)!;
    // 多付扣回记为负数（减少支出），少付补付记为正数（增加支出）
    const adjustmentAmount = correction.differenceAmount > 0
      ? -application.appliedAmount
      : application.appliedAmount;

    group.details.push({
      employee_name: employeeName,
      amount: Number(adjustmentAmount.toFixed(2)),
      description: `冲差调整: ${correction.reason} (原报销 ${correction.originalReimbursementId.slice(0, 8)}...)`,
    });
    group.totalAmount += adjustmentAmount;
    group.recordCount += 1;
  }

  // 6. 组装 items
  const items = Array.from(groups.values()).map(g => ({
    account_code: g.accountCode,
    account_name: g.accountName,
    total_amount: Number(g.totalAmount.toFixed(2)),
    record_count: g.recordCount,
    details: g.details,
  }));

  const totalAmount = Number(items.reduce((s, i) => s + i.total_amount, 0).toFixed(2));
  const totalRecords = items.reduce((s, i) => s + i.record_count, 0);

  // 7. 持久化（upsert）
  const existing = await db.query.reimbursementSummaries.findFirst({
    where: eq(reimbursementSummaries.summaryId, summaryId),
  });

  const now = new Date();

  if (existing) {
    await db
      .update(reimbursementSummaries)
      .set({
        items: items as any,
        totalAmount,
        totalRecords,
        generatedAt: now,
        updatedAt: now,
      })
      .where(eq(reimbursementSummaries.summaryId, summaryId));
  } else {
    await db.insert(reimbursementSummaries).values({
      summaryId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      items: items as any,
      totalAmount,
      totalRecords,
      currency: 'USD',
      isSynced: false,
      generatedAt: now,
    });
  }

  return {
    summary_id: summaryId,
    period_start: formatDate(period.periodStart),
    period_end: formatDate(period.periodEnd),
    items,
    total_amount: totalAmount,
    total_records: totalRecords,
    currency: 'USD',
    is_new: !existing,
  };
}

/**
 * 批量生成多个周期的汇总
 */
export async function generateMultipleSummaries(summaryIds: string[]): Promise<{
  generated: GenerateResult[];
  skipped: string[];  // 无数据的周期
  errors: { summaryId: string; error: string }[];
}> {
  const generated: GenerateResult[] = [];
  const skipped: string[] = [];
  const errors: { summaryId: string; error: string }[] = [];

  for (const sid of summaryIds) {
    try {
      const result = await generateAndPersistSummary(sid);
      if (result) {
        generated.push(result);
      } else {
        skipped.push(sid);
      }
    } catch (err) {
      errors.push({
        summaryId: sid,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { generated, skipped, errors };
}
