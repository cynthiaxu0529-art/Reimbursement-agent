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
import { reimbursements, reimbursementItems, users, departments, correctionApplications, expenseCorrections, syncedAccounts } from '@/lib/db/schema';
import { eq, inArray, and, or, isNull } from 'drizzle-orm';
import { getUserRoles } from '@/lib/auth/roles';
import { mapExpenseWithAccountNameResolver } from '@/lib/accounting/expense-account-mapping';
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
  previous_account_code?: string;
  coa_changed_at?: string;
  synced_je_id?: string;
  /**
   * Distinguishes reimbursement line items from correction adjustments so the
   * accounting agent routes mark-synced calls to the right table. Defaults to
   * 'reimbursement_item' when absent (backward compatible).
   */
  item_type?: 'reimbursement_item' | 'correction_application';
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
    const hasAccess = userRoles.some(r => ['finance', 'super_admin', 'admin'].includes(r));
    if (!hasAccess) {
      return NextResponse.json({ error: '需要财务或管理员权限' }, { status: 403 });
    }

    const tenantId = currentUser.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: '用户未关联公司' }, { status: 403 });
    }

    await ensureAccountsSynced().catch(err => {
      // 科目同步失败不影响汇总数据展示，仅记录警告
      console.warn('[accounting-summaries] ensureAccountsSynced failed (non-blocking):', err?.message);
    });

    // 获取同租户用户 ID 列表，用于包含 tenantId=null 的历史游离报销
    const tenantUserIds = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .then((rows: { id: string }[]) => rows.map(r => r.id));

    // 报销归属条件：
    //   1. 直接归属该租户（tenantId 匹配）
    //   2. 或：游离报销（tenantId=null）但提交人属于该租户（历史数据兼容）
    const reimbTenantCondition = tenantUserIds.length > 0
      ? or(
          eq(reimbursements.tenantId, tenantId),
          and(isNull(reimbursements.tenantId), inArray(reimbursements.userId, tenantUserIds))
        )
      : eq(reimbursements.tenantId, tenantId);

    // 获取已审批 + 已付款的报销（按 tenant 隔离）
    const approvedReimbs = await db
      .select({
        id: reimbursements.id,
        userId: reimbursements.userId,
        approvedAt: reimbursements.approvedAt,
        baseCurrency: reimbursements.baseCurrency,
        title: reimbursements.title,
      })
      .from(reimbursements)
      .where(and(eq(reimbursements.status, 'approved'), reimbTenantCondition));

    const paidReimbs = await db
      .select({
        id: reimbursements.id,
        userId: reimbursements.userId,
        approvedAt: reimbursements.approvedAt,
        baseCurrency: reimbursements.baseCurrency,
        title: reimbursements.title,
      })
      .from(reimbursements)
      .where(and(eq(reimbursements.status, 'paid'), reimbTenantCondition));

    const allReimbs = [...approvedReimbs, ...paidReimbs];

    if (allReimbs.length === 0) {
      console.log(`[accounting-summaries] tenantId=${tenantId}, tenantUserIds=${tenantUserIds.length}, approvedReimbs=0, paidReimbs=0`);
      return NextResponse.json({ success: true, summaries: [], _debug: { tenantId, tenantUserCount: tenantUserIds.length, approvedCount: 0, paidCount: 0 } });
    }

    const reimbIds = allReimbs.map(r => r.id);
    const allItems = await db.select().from(reimbursementItems).where(inArray(reimbursementItems.reimbursementId, reimbIds));

    const userIds = [...new Set(allReimbs.map(r => r.userId))];
    const userRecords = userIds.length > 0
      ? await db.select({ id: users.id, name: users.name, departmentId: users.departmentId, department: users.department }).from(users).where(inArray(users.id, userIds))
      : [];
    const userMap = new Map(userRecords.map((u: { id: string; name: string }) => [u.id, u.name]));

    // 查询部门信息（名称 + costCenter）
    const deptIds = [...new Set(userRecords.map(u => u.departmentId).filter(Boolean))] as string[];
    const deptRecords = deptIds.length > 0
      ? await db.select({ id: departments.id, name: departments.name, costCenter: departments.costCenter }).from(departments).where(and(inArray(departments.id, deptIds), eq(departments.tenantId, tenantId)))
      : [];
    const deptMap = new Map(deptRecords.map(d => [d.id, { name: d.name, costCenter: d.costCenter }]));

    // 用户 → 部门信息映射
    const userDeptMap = new Map<string, { name: string; costCenter: string | null }>();
    for (const u of userRecords) {
      if (u.departmentId && deptMap.has(u.departmentId)) {
        userDeptMap.set(u.id, deptMap.get(u.departmentId)!);
      } else if (u.department) {
        userDeptMap.set(u.id, { name: u.department, costCenter: null });
      }
    }

    // 一次性加载所有科目名称，避免循环内 N+1 DB 查询
    let syncedAccountRows: { accountCode: string; accountName: string }[] = [];
    try {
      syncedAccountRows = await db
        .select({ accountCode: syncedAccounts.accountCode, accountName: syncedAccounts.accountName })
        .from(syncedAccounts);
    } catch {
      // synced_accounts 表不存在或查询失败，使用 fallback 名称
    }
    const syncedAccountMap = new Map<string, string>(syncedAccountRows.map(a => [a.accountCode, a.accountName]));

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

      // 使用已存储的 coaCode 或根据部门费用性质重新映射
      const userId = reimbToUser.get(item.reimbursementId);
      const deptInfo = userId ? userDeptMap.get(userId) : undefined;

      let accountCode = item.coaCode;
      let accountName = item.coaName;
      if (!accountCode) {
        // 复用统一映射规则，并使用预加载科目名，避免循环内 N+1 查询
        const mapping = await mapExpenseWithAccountNameResolver(
          item.category,
          item.description,
          deptInfo?.costCenter,
          deptInfo?.name,
          async (code, fallbackName) => syncedAccountMap.get(code) || fallbackName,
        );
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

      const detail: SummaryDetail = {
        employee_name: employeeName,
        department: deptInfo?.name || '-',
        amount: Number((item.amountInBaseCurrency || item.amount).toFixed(2)),
        description: item.description,
        item_id: item.id,
        reimbursement_id: item.reimbursementId,
        category: item.category,
        account_code: accountCode!,
        account_name: accountName || '',
      };

      // Include COA change tracking for dedup awareness
      if (item.previousCoaCode && item.coaChangedAt) {
        detail.previous_account_code = item.previousCoaCode;
        detail.coa_changed_at = item.coaChangedAt.toISOString();
      }
      if (item.syncedJeId) {
        detail.synced_je_id = item.syncedJeId;
      }

      group.details.push(detail);
      group.totalAmount += item.amountInBaseCurrency || item.amount;
      group.recordCount += 1;
    }

    // 查询冲差抵扣记录（按 tenant 隔离）
    // 用 try-catch 包裹：若迁移尚未运行导致表不存在，不影响主汇总数据展示
    let allApplications: Array<{ application: typeof correctionApplications.$inferSelect; correction: typeof expenseCorrections.$inferSelect }> = [];
    try {
      allApplications = await db
        .select({
          application: correctionApplications,
          correction: expenseCorrections,
        })
        .from(correctionApplications)
        .innerJoin(expenseCorrections, and(
          eq(correctionApplications.correctionId, expenseCorrections.id),
          eq(expenseCorrections.tenantId, tenantId)
        ));
    } catch (correctionErr) {
      console.warn('[accounting-summaries] correction_applications query failed (table may not exist yet):', (correctionErr as Error)?.message);
    }

    for (const row of allApplications) {
      const { application, correction } = row;
      const appliedAt = application.appliedAt || new Date();
      const period = getHalfMonthPeriod(appliedAt);

      const adjustmentCode = '1220';
      const adjustmentName = correction.differenceAmount > 0
        ? '费用冲差调整（多付扣回）'
        : '费用冲差调整（少付补付）';

      const employeeName = String(userMap.get(correction.employeeId) || '未知');
      const deptInfo = userDeptMap.get(correction.employeeId);

      const groupKey = `${period.summaryId}::${adjustmentCode}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          period,
          accountCode: adjustmentCode,
          accountName: adjustmentName,
          details: [],
          totalAmount: 0,
          recordCount: 0,
        });
      }

      const group = groups.get(groupKey)!;
      const adjustmentAmount = correction.differenceAmount > 0
        ? -application.appliedAmount
        : application.appliedAmount;

      const correctionDetail: SummaryDetail = {
        employee_name: employeeName,
        department: deptInfo?.name || '-',
        amount: Number(adjustmentAmount.toFixed(2)),
        description: `冲差调整: ${correction.reason}`,
        item_id: application.id,
        reimbursement_id: correction.originalReimbursementId,
        category: 'correction_adjustment',
        account_code: adjustmentCode,
        account_name: adjustmentName,
        item_type: 'correction_application',
      };
      if (application.syncedJeId) {
        correctionDetail.synced_je_id = application.syncedJeId;
      }
      group.details.push(correctionDetail);
      group.totalAmount += adjustmentAmount;
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
