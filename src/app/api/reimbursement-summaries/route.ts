/**
 * 报销汇总 API
 *
 * GET /api/reimbursement-summaries
 *
 * 供 Accounting Agent 拉取汇总数据来入账。
 * 按半月周期 + account_code 维度 GROUP BY 已审批报销。
 *
 * 认证（任选其一）：
 *   1. X-Service-Key header（Service Account，需要 read:reimbursement_summaries 权限）
 *   2. Authorization: Bearer rk_*（API Key，需要 accounting_summary:read scope）
 *
 * 查询参数：
 *   since=<ISO timestamp> — 增量拉取，只返回该时间之后生成的汇总
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { reimbursements, reimbursementItems, users, departments, correctionApplications, expenseCorrections } from '@/lib/db/schema';
import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm';
import { authenticateServiceAccount, isServiceKeyRequest } from '@/lib/auth/service-account';
import { authenticate, logAgentAction, type AuthContext } from '@/lib/auth/api-key';
import { API_SCOPES } from '@/lib/auth/scopes';
import { mapExpenseToAccount } from '@/lib/accounting/expense-account-mapping';
import { ensureAccountsSynced } from '@/lib/accounting/chart-of-accounts-sync';

export const dynamic = 'force-dynamic';

// ============================================================================
// 类型定义
// ============================================================================

interface SummaryDetail {
  item_id: string;
  reimbursement_id: string;
  employee_name: string;
  amount: number;
  description: string;
  category: string;
  /** Previous account code if COA was changed (for dedup — update existing JE instead of creating new) */
  previous_account_code?: string;
  /** Timestamp when the COA was last changed */
  coa_changed_at?: string;
  /** External JE ID if this item/correction has already been synced */
  synced_je_id?: string;
  /**
   * Distinguishes reimbursement line items from correction adjustments so
   * the accounting agent routes mark-synced calls to the right table.
   * Defaults to 'reimbursement_item' when absent.
   */
  item_type?: 'reimbursement_item' | 'correction_application';
}

interface SummaryItem {
  account_code: string;
  account_name: string;
  total_amount: number;
  record_count: number;
  details: SummaryDetail[];
  /** true if no specific mapping rule matched — fell back to miscellaneous account */
  is_fallback?: boolean;
  /** sample original categories / description snippets that triggered the fallback */
  fallback_hints?: string[];
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

/** 向响应注入 Rate Limit header（如果有） */
function withRateHeaders(response: NextResponse, authCtx: AuthContext): NextResponse {
  if (authCtx.rateLimit) {
    response.headers.set('X-RateLimit-Limit', String(authCtx.rateLimit.limit));
    response.headers.set('X-RateLimit-Remaining', String(authCtx.rateLimit.remaining));
    response.headers.set('X-RateLimit-Reset', String(authCtx.rateLimit.resetAt));
  }
  return response;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  let authCtx: AuthContext | null = null;

  try {
    // 1. 认证：优先 Service Account，其次 API Key（含 Session 回退）
    if (isServiceKeyRequest(request)) {
      // Service Account 认证（原有路径）
      const saResult = await authenticateServiceAccount(request, 'read:reimbursement_summaries');
      if (!saResult.success) {
        return NextResponse.json(
          { error: saResult.error.error, code: saResult.error.code },
          { status: saResult.error.statusCode }
        );
      }
      // Service Account 不需要填充 authCtx，后续无需审计
    } else {
      // API Key 或 Session 认证
      const akResult = await authenticate(request, API_SCOPES.ACCOUNTING_SUMMARY_READ);
      if (!akResult.success) {
        return NextResponse.json(
          { error: akResult.error },
          { status: akResult.statusCode }
        );
      }
      authCtx = akResult.context;
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
      isFallback: boolean;
      fallbackHints: string[];  // collect original category/description snippets
    }>();

    for (const item of allItems) {
      // 确定日期（使用审批日期来确定归属周期）
      const approvedAt = reimbToDate.get(item.reimbursementId);
      if (!approvedAt) continue;

      const period = getHalfMonthPeriod(approvedAt);

      // Use stored coaCode if available (set by finance adjust), otherwise map dynamically
      const userId = reimbToUser.get(item.reimbursementId);
      const deptInfo = userId ? userDeptMap.get(userId) : undefined;

      let accountCode = item.coaCode;
      let accountName = item.coaName;
      let mapping: { accountCode: string; accountName: string; is_fallback?: boolean } | null = null;

      if (!accountCode) {
        mapping = await mapExpenseToAccount(item.category, item.description, deptInfo?.costCenter, deptInfo?.name);
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
          isFallback: false,
          fallbackHints: [],
        });
      }

      const group = groups.get(groupKey)!;
      const employeeName = userId ? (userMap.get(userId) || '未知') : '未知';

      // Build detail with item-level tracking for dedup
      const detail: SummaryDetail = {
        item_id: item.id,
        reimbursement_id: item.reimbursementId,
        employee_name: String(employeeName),
        amount: Number((item.amountInBaseCurrency || item.amount).toFixed(2)),
        description: item.description,
        category: item.category,
      };

      // Include COA change info so accounting agent can update existing JEs
      if (item.previousCoaCode && item.coaChangedAt) {
        detail.previous_account_code = item.previousCoaCode;
        detail.coa_changed_at = item.coaChangedAt.toISOString();
      }

      // Include synced JE ID if already synced
      if (item.syncedJeId) {
        detail.synced_je_id = item.syncedJeId;
      }

      group.details.push(detail);
      group.totalAmount += item.amountInBaseCurrency || item.amount;
      group.recordCount += 1;

      // Track fallback mappings for finance to-do
      if (mapping?.is_fallback) {
        group.isFallback = true;
        const hint = `${item.category}${item.description ? ': ' + item.description.slice(0, 40) : ''}`;
        if (!group.fallbackHints.includes(hint) && group.fallbackHints.length < 5) {
          group.fallbackHints.push(hint);
        }
      }
    }

    // 7.5 冲差抵扣记录 — 产生科目 1220 的调整行
    // 应用时间决定归属的半月期间，与已入账的原报销可能跨期。
    // Try-catch 兜底：迁移未跑时表可能不存在，不影响主汇总数据返回。
    let allApplications: Array<{
      application: typeof correctionApplications.$inferSelect;
      correction: typeof expenseCorrections.$inferSelect;
    }> = [];
    try {
      allApplications = await db
        .select({
          application: correctionApplications,
          correction: expenseCorrections,
        })
        .from(correctionApplications)
        .innerJoin(
          expenseCorrections,
          eq(correctionApplications.correctionId, expenseCorrections.id),
        );
    } catch (correctionErr) {
      console.warn(
        '[reimbursement-summaries] correction_applications query failed (table may not exist yet):',
        (correctionErr as Error)?.message,
      );
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

      const groupKey = `${period.summaryId}::${adjustmentCode}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          period,
          accountCode: adjustmentCode,
          accountName: adjustmentName,
          details: [],
          totalAmount: 0,
          recordCount: 0,
          isFallback: false,
          fallbackHints: [],
        });
      }

      const group = groups.get(groupKey)!;
      const adjustmentAmount = correction.differenceAmount > 0
        ? -application.appliedAmount
        : application.appliedAmount;

      const correctionDetail: SummaryDetail = {
        item_id: application.id,
        reimbursement_id: correction.originalReimbursementId,
        employee_name: employeeName,
        amount: Number(adjustmentAmount.toFixed(2)),
        description: `冲差调整: ${correction.reason}`,
        category: 'correction_adjustment',
        item_type: 'correction_application',
      };
      if (application.syncedJeId) {
        correctionDetail.synced_je_id = application.syncedJeId;
      }
      group.details.push(correctionDetail);
      group.totalAmount += adjustmentAmount;
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
        ...(group.isFallback && {
          is_fallback: true,
          fallback_hints: group.fallbackHints,
        }),
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

    // 10. Build coa_changes list — items whose account codes have changed.
    //     The accounting agent should UPDATE existing JEs for these items
    //     instead of creating new ones (prevents duplicates).
    const coaChanges: Array<{
      item_id: string;
      reimbursement_id: string;
      previous_account_code: string;
      current_account_code: string;
      current_account_name: string;
      changed_at: string;
      synced_je_id: string | null;
    }> = [];

    for (const item of allItems) {
      if (item.previousCoaCode && item.coaChangedAt) {
        coaChanges.push({
          item_id: item.id,
          reimbursement_id: item.reimbursementId,
          previous_account_code: item.previousCoaCode,
          current_account_code: item.coaCode || '',
          current_account_name: item.coaName || '',
          changed_at: item.coaChangedAt.toISOString(),
          synced_je_id: item.syncedJeId || null,
        });
      }
    }

    const response = NextResponse.json({
      summaries,
      // Items whose account codes changed — accounting agent must UPDATE
      // existing JEs for these items, not create new ones
      coa_changes: coaChanges.length > 0 ? coaChanges : undefined,
    });

    // API Key 审计日志 + Rate Limit headers
    if (authCtx?.authType === 'api_key' && authCtx.apiKey) {
      logAgentAction({
        tenantId: authCtx.tenantId!,
        apiKeyId: authCtx.apiKey.id,
        userId: authCtx.userId,
        action: 'accounting_summary:read',
        method: 'GET',
        path: '/api/reimbursement-summaries',
        statusCode: 200,
        agentType: authCtx.apiKey.agentType,
        requestSummary: { since: sinceParam },
        responseSummary: { count: summaries.length },
        entityType: 'accounting_summary',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        durationMs: Date.now() - startTime,
      });
      return withRateHeaders(response, authCtx);
    }

    return response;
  } catch (error) {
    console.error('Reimbursement summaries error:', error);
    return NextResponse.json(
      { error: 'Failed to generate reimbursement summaries' },
      { status: 500 }
    );
  }
}
