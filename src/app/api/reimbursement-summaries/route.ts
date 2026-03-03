/**
 * 报销汇总 API
 *
 * GET /api/reimbursement-summaries
 *
 * 供 Accounting Agent 拉取汇总数据来入账。
 * 按半月周期 + account_code 维度 GROUP BY 已审批报销。
 *
 * 认证：X-Service-Key header，需要 read:reimbursement_summaries 权限
 *
 * 查询参数：
 *   since=<ISO timestamp> — 增量拉取，只返回该时间之后生成的汇总
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { reimbursements, reimbursementItems, users, departments } from '@/lib/db/schema';
import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm';
import { authenticateServiceAccount, isServiceKeyRequest } from '@/lib/auth/service-account';
import { mapExpenseToAccount } from '@/lib/accounting/expense-account-mapping';
import { ensureAccountsSynced } from '@/lib/accounting/chart-of-accounts-sync';

export const dynamic = 'force-dynamic';

// ============================================================================
// 类型定义
// ============================================================================

interface SummaryDetail {
  employee_name: string;
  amount: number;
  description: string;
}

interface SummaryItem {
  account_code: string;
  account_name: string;
  total_amount: number;
  record_count: number;
  details: SummaryDetail[];
}

interface Summary {
  summary_id: string;
  period_start: string;
  period_end: string;
  items: SummaryItem[];
  total_amount: number;
  total_records: number;
  currency: string;
}

// ============================================================================
// 半月周期计算
// ============================================================================

interface HalfMonthPeriod {
  summaryId: string;
  periodStart: Date;
  periodEnd: Date;
  label: string; // 'A' or 'B'
}

function getHalfMonthPeriod(date: Date): HalfMonthPeriod {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-based
  const day = date.getDate();

  const yearStr = String(year);
  const monthStr = String(month + 1).padStart(2, '0');

  if (day <= 15) {
    // 上半月 A: 1-15
    return {
      summaryId: `REIMB-SUM-${yearStr}${monthStr}-A`,
      periodStart: new Date(year, month, 1),
      periodEnd: new Date(year, month, 15, 23, 59, 59, 999),
      label: 'A',
    };
  } else {
    // 下半月 B: 16-月末
    const lastDay = new Date(year, month + 1, 0).getDate();
    return {
      summaryId: `REIMB-SUM-${yearStr}${monthStr}-B`,
      periodStart: new Date(year, month, 16),
      periodEnd: new Date(year, month, lastDay, 23, 59, 59, 999),
      label: 'B',
    };
  }
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 获取给定时间范围内所有可能的半月周期
 */
function getAllHalfMonthPeriods(startDate: Date, endDate: Date): HalfMonthPeriod[] {
  const periods: HalfMonthPeriod[] = [];
  const seen = new Set<string>();

  const current = new Date(startDate);
  while (current <= endDate) {
    const period = getHalfMonthPeriod(current);
    if (!seen.has(period.summaryId)) {
      seen.add(period.summaryId);
      periods.push(period);
    }
    // 跳到下个半月
    if (current.getDate() <= 15) {
      current.setDate(16);
    } else {
      current.setMonth(current.getMonth() + 1);
      current.setDate(1);
    }
  }

  return periods;
}

// ============================================================================
// API Handler
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // 1. Service Account 认证
    if (!isServiceKeyRequest(request)) {
      return NextResponse.json(
        { error: 'X-Service-Key header required' },
        { status: 401 }
      );
    }

    const authResult = await authenticateServiceAccount(request, 'read:reimbursement_summaries');
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error.error, code: authResult.error.code },
        { status: authResult.error.statusCode }
      );
    }

    // 2. 确保科目表已同步
    await ensureAccountsSynced();

    // 3. 解析查询参数
    const { searchParams } = new URL(request.url);
    const sinceParam = searchParams.get('since');

    // 4. 查询已审批的报销单
    const conditions = [
      eq(reimbursements.status, 'approved'),
    ];

    // 获取所有已审批报销单
    const approvedReimbursements = await db
      .select({
        id: reimbursements.id,
        userId: reimbursements.userId,
        approvedAt: reimbursements.approvedAt,
        baseCurrency: reimbursements.baseCurrency,
      })
      .from(reimbursements)
      .where(and(...conditions));

    // 也包含已付款的（它们也应该被汇总）
    const paidReimbursements = await db
      .select({
        id: reimbursements.id,
        userId: reimbursements.userId,
        approvedAt: reimbursements.approvedAt,
        baseCurrency: reimbursements.baseCurrency,
      })
      .from(reimbursements)
      .where(eq(reimbursements.status, 'paid'));

    const allReimbursements = [...approvedReimbursements, ...paidReimbursements];

    if (allReimbursements.length === 0) {
      return NextResponse.json({ summaries: [] });
    }

    // 5. 获取所有报销明细
    const reimbursementIds = allReimbursements.map(r => r.id);
    const allItems = await db
      .select()
      .from(reimbursementItems)
      .where(inArray(reimbursementItems.reimbursementId, reimbursementIds));

    // 6. 获取用户信息（用于 details）
    const userIds = [...new Set(allReimbursements.map(r => r.userId))];
    const userRecords = userIds.length > 0
      ? await db.select({ id: users.id, name: users.name, departmentId: users.departmentId, department: users.department }).from(users).where(inArray(users.id, userIds))
      : [];
    const userMap = new Map(userRecords.map((u: { id: string; name: string }) => [u.id, u.name]));

    // 查询部门信息（名称 + costCenter）
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

    // 创建 reimbursement 到 user 的映射
    const reimbToUser = new Map(allReimbursements.map(r => [r.id, r.userId]));
    const reimbToDate = new Map(allReimbursements.map(r => [r.id, r.approvedAt || new Date()]));

    // 7. 按半月周期 + account_code 分组
    type GroupKey = string; // `${summaryId}::${accountCode}`
    const groups = new Map<GroupKey, {
      period: HalfMonthPeriod;
      accountCode: string;
      accountName: string;
      details: SummaryDetail[];
      totalAmount: number;
      recordCount: number;
    }>();

    for (const item of allItems) {
      // 确定日期（使用审批日期来确定归属周期）
      const approvedAt = reimbToDate.get(item.reimbursementId);
      if (!approvedAt) continue;

      const period = getHalfMonthPeriod(approvedAt);

      // 映射科目（传入部门 costCenter 和名称）
      const userId = reimbToUser.get(item.reimbursementId);
      const deptInfo = userId ? userDeptMap.get(userId) : undefined;
      const mapping = await mapExpenseToAccount(item.category, item.description, deptInfo?.costCenter, deptInfo?.name);

      const groupKey = `${period.summaryId}::${mapping.accountCode}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          period,
          accountCode: mapping.accountCode,
          accountName: mapping.accountName,
          details: [],
          totalAmount: 0,
          recordCount: 0,
        });
      }

      const group = groups.get(groupKey)!;
      const employeeName = userId ? (userMap.get(userId) || '未知') : '未知';

      group.details.push({
        employee_name: String(employeeName),
        amount: Number((item.amountInBaseCurrency || item.amount).toFixed(2)),
        description: item.description,
      });
      group.totalAmount += item.amountInBaseCurrency || item.amount;
      group.recordCount += 1;
    }

    // 8. 组装成 Summary 结构
    const summaryMap = new Map<string, Summary>();

    for (const group of groups.values()) {
      const sid = group.period.summaryId;

      if (!summaryMap.has(sid)) {
        summaryMap.set(sid, {
          summary_id: sid,
          period_start: formatDate(group.period.periodStart),
          period_end: formatDate(group.period.periodEnd),
          items: [],
          total_amount: 0,
          total_records: 0,
          currency: 'USD',
        });
      }

      const summary = summaryMap.get(sid)!;
      summary.items.push({
        account_code: group.accountCode,
        account_name: group.accountName,
        total_amount: Number(group.totalAmount.toFixed(2)),
        record_count: group.recordCount,
        details: group.details,
      });
      summary.total_amount += group.totalAmount;
      summary.total_records += group.recordCount;
    }

    // 四舍五入 total_amount
    for (const summary of summaryMap.values()) {
      summary.total_amount = Number(summary.total_amount.toFixed(2));
    }

    // 9. 如果有 since 参数，按 summary_id 中的时间过滤
    let summaries = Array.from(summaryMap.values());

    if (sinceParam) {
      const sinceDate = new Date(sinceParam);
      if (!isNaN(sinceDate.getTime())) {
        summaries = summaries.filter(s => {
          // 只返回 period_end >= since 的汇总
          const periodEnd = new Date(s.period_end + 'T23:59:59.999Z');
          return periodEnd >= sinceDate;
        });
      }
    }

    // 按 period_start 排序
    summaries.sort((a, b) => a.period_start.localeCompare(b.period_start));

    return NextResponse.json({ summaries });
  } catch (error) {
    console.error('Reimbursement summaries error:', error);
    return NextResponse.json(
      { error: 'Failed to generate reimbursement summaries' },
      { status: 500 }
    );
  }
}
