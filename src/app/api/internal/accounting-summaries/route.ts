/**
 * 内部 API：获取记账汇总数据（Session 认证，供前端页面使用）
 *
 * GET /api/internal/accounting-summaries
 *
 * 与 /api/reimbursement-summaries 逻辑相同，但使用 Session 认证。
 * 需要 finance 或 admin 权限。
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, reimbursementItems, users, departments } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getUserRoles } from '@/lib/auth/roles';
import { mapExpenseToAccount } from '@/lib/accounting/expense-account-mapping';
import { ensureAccountsSynced } from '@/lib/accounting/chart-of-accounts-sync';

export const dynamic = 'force-dynamic';

interface SummaryDetail {
  employee_name: string;
  department: string;
  amount: number;
  description: string;
  item_id: string;
  reimbursement_id: string;
  category: string;
  account_code: string;
  account_name: string;
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

interface HalfMonthPeriod {
  summaryId: string;
  periodStart: Date;
  periodEnd: Date;
}

function getHalfMonthPeriod(date: Date): HalfMonthPeriod {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const yearStr = String(year);
  const monthStr = String(month + 1).padStart(2, '0');

  if (day <= 15) {
    return {
      summaryId: `REIMB-SUM-${yearStr}${monthStr}-A`,
      periodStart: new Date(year, month, 1),
      periodEnd: new Date(year, month, 15, 23, 59, 59, 999),
    };
  } else {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return {
      summaryId: `REIMB-SUM-${yearStr}${monthStr}-B`,
      periodStart: new Date(year, month, 16),
      periodEnd: new Date(year, month, lastDay, 23, 59, 59, 999),
    };
  }
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });
    if (!currentUser) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }

    const userRoles = getUserRoles(currentUser);
    const hasAccess = userRoles.some(r => ['finance', 'admin', 'super_admin'].includes(r));
    if (!hasAccess) {
      return NextResponse.json({ error: '需要财务或管理员权限' }, { status: 403 });
    }

    await ensureAccountsSynced();

    // 获取已审批 + 已付款的报销
    const approvedReimbs = await db
      .select({
        id: reimbursements.id,
        userId: reimbursements.userId,
        approvedAt: reimbursements.approvedAt,
        baseCurrency: reimbursements.baseCurrency,
        title: reimbursements.title,
      })
      .from(reimbursements)
      .where(eq(reimbursements.status, 'approved'));

    const paidReimbs = await db
      .select({
        id: reimbursements.id,
        userId: reimbursements.userId,
        approvedAt: reimbursements.approvedAt,
        baseCurrency: reimbursements.baseCurrency,
        title: reimbursements.title,
      })
      .from(reimbursements)
      .where(eq(reimbursements.status, 'paid'));

    const allReimbs = [...approvedReimbs, ...paidReimbs];

    if (allReimbs.length === 0) {
      return NextResponse.json({ success: true, summaries: [] });
    }

    const reimbIds = allReimbs.map(r => r.id);
    const allItems = await db.select().from(reimbursementItems).where(inArray(reimbursementItems.reimbursementId, reimbIds));

    const userIds = [...new Set(allReimbs.map(r => r.userId))];
    const userRecords = userIds.length > 0
      ? await db.select({ id: users.id, name: users.name, departmentId: users.departmentId, department: users.department }).from(users).where(inArray(users.id, userIds))
      : [];
    const userMap = new Map(userRecords.map((u: { id: string; name: string }) => [u.id, u.name]));

    // 查询部门名称
    const deptIds = [...new Set(userRecords.map(u => u.departmentId).filter(Boolean))] as string[];
    const deptRecords = deptIds.length > 0
      ? await db.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, deptIds))
      : [];
    const deptMap = new Map(deptRecords.map(d => [d.id, d.name]));

    // 用户 → 部门名称映射
    const userDeptMap = new Map<string, string>();
    for (const u of userRecords) {
      const deptName = (u.departmentId ? deptMap.get(u.departmentId) : null) || u.department || null;
      if (deptName) userDeptMap.set(u.id, deptName);
    }

    const reimbToUser = new Map(allReimbs.map(r => [r.id, r.userId]));
    const reimbToDate = new Map(allReimbs.map(r => [r.id, r.approvedAt || new Date()]));

    type GroupKey = string;
    const groups = new Map<GroupKey, {
      period: HalfMonthPeriod;
      accountCode: string;
      accountName: string;
      details: SummaryDetail[];
      totalAmount: number;
      recordCount: number;
    }>();

    for (const item of allItems) {
      const approvedAt = reimbToDate.get(item.reimbursementId);
      if (!approvedAt) continue;

      const period = getHalfMonthPeriod(approvedAt);

      // 使用已存储的 coaCode 或重新映射（传入部门名称以区分 R&D / S&M / G&A）
      const userId = reimbToUser.get(item.reimbursementId);
      const deptName = userId ? userDeptMap.get(userId) || null : null;

      let accountCode = item.coaCode;
      let accountName = item.coaName;
      if (!accountCode) {
        const mapping = await mapExpenseToAccount(item.category, item.description, deptName);
        accountCode = mapping.accountCode;
        accountName = mapping.accountName;
      }

      const groupKey = `${period.summaryId}::${accountCode}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          period,
          accountCode: accountCode!,
          accountName: accountName || '',
          details: [],
          totalAmount: 0,
          recordCount: 0,
        });
      }

      const group = groups.get(groupKey)!;
      const employeeName = userId ? String(userMap.get(userId) || '未知') : '未知';

      group.details.push({
        employee_name: employeeName,
        department: deptName || '-',
        amount: Number((item.amountInBaseCurrency || item.amount).toFixed(2)),
        description: item.description,
        item_id: item.id,
        reimbursement_id: item.reimbursementId,
        category: item.category,
        account_code: accountCode!,
        account_name: accountName || '',
      });
      group.totalAmount += item.amountInBaseCurrency || item.amount;
      group.recordCount += 1;
    }

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

    for (const summary of summaryMap.values()) {
      summary.total_amount = Number(summary.total_amount.toFixed(2));
    }

    const summaries = Array.from(summaryMap.values()).sort((a, b) => b.period_start.localeCompare(a.period_start));

    return NextResponse.json({ success: true, summaries });
  } catch (error) {
    console.error('Internal accounting summaries error:', error);
    return NextResponse.json({ error: '获取汇总数据失败' }, { status: 500 });
  }
}
