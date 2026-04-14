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
import { classifyDepartment } from '@/lib/accounting/expense-account-mapping';
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

/**
 * 同步版科目映射（使用预加载的 syncedAccountMap，无 DB 查询）
 * 替代 mapExpenseToAccount 在循环内的 N+1 调用
 */
function mapExpenseToAccountSync(
  category: string,
  description: string,
  costCenter: string | null | undefined,
  departmentName: string | null | undefined,
  syncedAccountMap: Map<string, string>,
): { accountCode: string; accountName: string } {
  const fn = classifyDepartment(costCenter, departmentName);

  const EXPENSE_TYPE_RULES: Array<{
    expenseType: string;
    categories: string[];
    codes: { rd: string; sm: string; ga: string; rdName: string; smName: string; gaName: string };
  }> = [
    { expenseType: 'travel', categories: ['taxi','car_rental','fuel','parking','toll','flight','train','hotel'], codes: { rd:'6440', sm:'6170', ga:'6270', rdName:'R&D - Travel & Entertainment', smName:'S&M - Travel & Entertainment', gaName:'G&A - Travel & Entertainment' } },
    { expenseType: 'meals', categories: ['meal','client_entertainment'], codes: { rd:'6450', sm:'6180', ga:'6280', rdName:'R&D - Meals & Entertainment', smName:'S&M - Meals & Entertainment', gaName:'G&A - Meals & Entertainment' } },
    { expenseType: 'office_supplies', categories: ['office_supplies','equipment','printing'], codes: { rd:'6460', sm:'6190', ga:'6230', rdName:'R&D - Office Supplies', smName:'S&M - Miscellaneous Expense', gaName:'G&A - Office Supplies' } },
    { expenseType: 'training', categories: ['training','conference'], codes: { rd:'6470', sm:'6140', ga:'6330', rdName:'R&D - Training & Conferences', smName:'S&M - Events & Conferences', gaName:'G&A - Training & Development' } },
    { expenseType: 'shipping', categories: ['courier'], codes: { rd:'6490', sm:'6190', ga:'6370', rdName:'R&D - Miscellaneous Expense', smName:'S&M - Miscellaneous Expense', gaName:'G&A - Shipping & Postage' } },
    { expenseType: 'telecom', categories: ['phone','internet'], codes: { rd:'6490', sm:'6190', ga:'6290', rdName:'R&D - Miscellaneous Expense', smName:'S&M - Miscellaneous Expense', gaName:'G&A - Telephone & Internet' } },
    { expenseType: 'cloud', categories: ['cloud_resource','ai_token'], codes: { rd:'6420', sm:'6150', ga:'6390', rdName:'R&D - Cloud & Infrastructure', smName:'S&M - CRM & Sales Tools', gaName:'G&A - Miscellaneous Expense' } },
    { expenseType: 'software', categories: ['software'], codes: { rd:'6430', sm:'6150', ga:'6390', rdName:'R&D - Software & Subscriptions', smName:'S&M - CRM & Sales Tools', gaName:'G&A - Miscellaneous Expense' } },
    { expenseType: 'advertising', categories: ['marketing'], codes: { rd:'6490', sm:'6120', ga:'6390', rdName:'R&D - Miscellaneous Expense', smName:'S&M - Digital Advertising', gaName:'G&A - Miscellaneous Expense' } },
    { expenseType: 'content_seo', categories: ['content','seo'], codes: { rd:'6490', sm:'6130', ga:'6390', rdName:'R&D - Miscellaneous Expense', smName:'S&M - Content & SEO', gaName:'G&A - Miscellaneous Expense' } },
    { expenseType: 'pr_communications', categories: ['pr','communications'], codes: { rd:'6490', sm:'6160', ga:'6390', rdName:'R&D - Miscellaneous Expense', smName:'S&M - PR & Communications', gaName:'G&A - Miscellaneous Expense' } },
  ];

  const catLower = (category || '').toLowerCase();
  const descLower = (description || '').toLowerCase();
  const MISC_CODES = { rd: '6490', sm: '6190', ga: '6390', rdName: 'R&D - Miscellaneous Expense', smName: 'S&M - Miscellaneous Expense', gaName: 'G&A - Miscellaneous Expense' };

  let codes = MISC_CODES;
  for (const rule of EXPENSE_TYPE_RULES) {
    if (rule.categories.includes(catLower)) { codes = rule.codes; break; }
  }
  if (codes === MISC_CODES) {
    const keywords: Record<string, typeof MISC_CODES> = {
      '交通|打车|出差|taxi|uber|机票|flight|住宿|酒店|hotel|差旅|travel': EXPENSE_TYPE_RULES[0].codes,
      '餐饮|餐费|招待|meals|food|午餐|晚餐|早餐|dinner|lunch|breakfast': EXPENSE_TYPE_RULES[1].codes,
      '办公用品|文具|office|stationery': EXPENSE_TYPE_RULES[2].codes,
      '培训|课程|training|conference|会议|学习': EXPENSE_TYPE_RULES[3].codes,
      '快递|邮寄|shipping|postage|物流': EXPENSE_TYPE_RULES[4].codes,
      '通讯|电话|internet|phone|网络|telecom': EXPENSE_TYPE_RULES[5].codes,
      '云|cloud|aws|gcp|azure|server|服务器|ai token|openai|anthropic': EXPENSE_TYPE_RULES[6].codes,
      '软件|software|license|许可|saas|subscription|订阅': EXPENSE_TYPE_RULES[7].codes,
      '广告|advertising|promotion|推广|营销|marketing|kol|红包': EXPENSE_TYPE_RULES[8].codes,
      '内容|content|文案|copywriting|seo|sem|搜索优化|视频制作|博客|blog': EXPENSE_TYPE_RULES[9].codes,
      '公关|pr|public relations|媒体关系|新闻稿|press release|传播|品牌传播|外宣|舆情': EXPENSE_TYPE_RULES[10].codes,
    };
    for (const [kwGroup, c] of Object.entries(keywords)) {
      if (kwGroup.split('|').some(kw => descLower.includes(kw))) { codes = c; break; }
    }
  }

  const accountCode = codes[fn];
  const fallbackName = codes[`${fn}Name` as 'rdName' | 'smName' | 'gaName'];
  const accountName = syncedAccountMap.get(accountCode) || fallbackName;
  return { accountCode, accountName };
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
        // 直接用内存 Map 查科目名，不再逐条查库（N+1 修复）
        const mapping = mapExpenseToAccountSync(item.category, item.description, deptInfo?.costCenter, deptInfo?.name, syncedAccountMap);
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

      group.details.push({
        employee_name: employeeName,
        department: deptInfo?.name || '-',
        amount: Number(adjustmentAmount.toFixed(2)),
        description: `冲差调整: ${correction.reason}`,
        item_id: application.id,
        reimbursement_id: correction.originalReimbursementId,
        category: 'correction_adjustment',
        account_code: adjustmentCode,
        account_name: adjustmentName,
      });
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
