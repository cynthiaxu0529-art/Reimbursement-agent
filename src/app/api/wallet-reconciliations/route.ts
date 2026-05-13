/**
 * 钱包对账 API
 *
 * POST /api/wallet-reconciliations  上传 CSV，立即跑匹配，落库
 * GET  /api/wallet-reconciliations  列出本租户的对账记录
 *
 * 仅财务 / super_admin 可用。
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  walletReconciliations,
  reconciliationDiscrepancies,
  payments,
  reimbursements,
  users,
} from '@/lib/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';
import { apiError } from '@/lib/api-error';
import { parseFluxaCsv, inferPeriod } from '@/lib/reconciliation/csv-parser';
import { SUCCESS_PAYOUT_STATUSES } from '@/lib/payment-sync';
import {
  matchPaymentsAgainstCsv,
  DEFAULT_TOLERANCE,
  type PaymentRecord,
  type ToleranceConfig,
} from '@/lib/reconciliation/match';

export const dynamic = 'force-dynamic';

const MAX_CSV_SIZE = 5 * 1024 * 1024; // 5MB

async function requireFinanceContext(): Promise<
  | { ok: true; userId: string; tenantId: string }
  | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id || !session.user.tenantId) {
    return { ok: false, response: apiError('未登录', 401) };
  }
  const [me] = await db
    .select({ role: users.role, roles: users.roles })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const roles = getUserRoles(me || {});
  if (!canProcessPayment(roles)) {
    return { ok: false, response: apiError('需要财务或超级管理员权限', 403) };
  }
  return { ok: true, userId: session.user.id, tenantId: session.user.tenantId };
}

/** 把数据库 payments 行映射成匹配库期望的结构 */
function toPaymentRecord(p: typeof payments.$inferSelect): PaymentRecord {
  return {
    id: p.id,
    reimbursementId: p.reimbursementId,
    payoutId: p.payoutId,
    txHash: p.txHash,
    toAddress: p.toAddress,
    amount: p.amount,
    currency: p.currency,
    paidAt: p.paidAt,
    payoutStatus: p.payoutStatus,
  };
}

export async function POST(request: NextRequest) {
  const ctx = await requireFinanceContext();
  if (!ctx.ok) return ctx.response;

  try {
    const contentType = request.headers.get('content-type') || '';
    let csvContent: string;
    let fileName: string;
    let toleranceOverride: Partial<ToleranceConfig> = {};

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return apiError('请上传 CSV 文件', 400, 'MISSING_FILE');
      }
      if (file.size > MAX_CSV_SIZE) {
        return apiError(`文件过大，最大支持 ${MAX_CSV_SIZE / 1024 / 1024}MB`, 400, 'FILE_TOO_LARGE');
      }
      csvContent = await file.text();
      fileName = file.name;
      const tolStr = form.get('tolerance');
      if (typeof tolStr === 'string' && tolStr) {
        try {
          toleranceOverride = JSON.parse(tolStr);
        } catch {
          // ignore — 用默认
        }
      }
    } else {
      const body = await request.json();
      if (!body.csvContent || typeof body.csvContent !== 'string') {
        return apiError('请提供 csvContent 字段', 400, 'MISSING_FIELDS');
      }
      csvContent = body.csvContent;
      fileName = body.fileName || 'reconciliation.csv';
      toleranceOverride = body.tolerance || {};
    }

    const parseResult = parseFluxaCsv(csvContent);
    if (parseResult.errors.length > 0 && parseResult.rows.length === 0) {
      return apiError(
        `CSV 解析失败：${parseResult.errors.map((e) => `line ${e.line}: ${e.reason}`).join('; ')}`,
        400,
        'CSV_PARSE_FAILED',
      );
    }

    const period = inferPeriod(parseResult.rows);
    const tolerance: ToleranceConfig = { ...DEFAULT_TOLERANCE, ...toleranceOverride };

    // 拉本租户所有 status='succeeded' 的 fluxa payments
    // payments 表没有 tenantId，必须 join reimbursements 拿租户边界
    // 不按 csv 时间范围过滤，留给匹配阶段的时间窗口逻辑判断
    const allPayments = await db
      .select({ payment: payments })
      .from(payments)
      .innerJoin(reimbursements, eq(payments.reimbursementId, reimbursements.id))
      .where(
        and(
          eq(reimbursements.tenantId, ctx.tenantId),
          // Fluxa 实际可能返回 succeeded / success / confirmed
          inArray(payments.payoutStatus, SUCCESS_PAYOUT_STATUSES as unknown as string[]),
          eq(payments.paymentProvider, 'fluxa'),
        ),
      );

    const paymentRecords: PaymentRecord[] = allPayments.map((row) => toPaymentRecord(row.payment));

    const matchResult = matchPaymentsAgainstCsv(paymentRecords, parseResult.rows, tolerance);

    // 落库
    const [created] = await db
      .insert(walletReconciliations)
      .values({
        tenantId: ctx.tenantId,
        uploadedBy: ctx.userId,
        fileName,
        periodStart: period.periodStart || null,
        periodEnd: period.periodEnd || null,
        rawRows: parseResult.rows,
        rowCount: parseResult.rows.length,
        status: 'completed',
        csvTotalAmount: matchResult.csvTotalAmount,
        matchedCount: matchResult.matchedCount,
        matchedAmount: matchResult.matchedAmount,
        discrepancyCount: matchResult.discrepancies.length,
        toleranceConfig: tolerance,
      })
      .returning();

    if (matchResult.discrepancies.length > 0) {
      await db.insert(reconciliationDiscrepancies).values(
        matchResult.discrepancies.map((d) => ({
          reconciliationId: created.id,
          tenantId: ctx.tenantId,
          type: d.type,
          paymentId: d.paymentId || null,
          csvRowIndex: d.csvRowIndex ?? null,
          csvRowSnapshot: d.csvRowSnapshot || null,
          matchedBy: d.matchedBy || null,
          matchConfidence: d.matchConfidence || null,
          details: d.details,
        })),
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: created.id,
        rowCount: created.rowCount,
        matchedCount: created.matchedCount,
        discrepancyCount: created.discrepancyCount,
        csvTotalAmount: created.csvTotalAmount,
        matchedAmount: created.matchedAmount,
        warnings: parseResult.warnings,
        parseErrors: parseResult.errors,
      },
    });
  } catch (error) {
    console.error('Wallet reconciliation upload error:', error);
    return apiError('对账失败：' + (error as Error).message, 500);
  }
}

export async function GET(request: NextRequest) {
  const ctx = await requireFinanceContext();
  if (!ctx.ok) return ctx.response;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);

  const list = await db
    .select({
      id: walletReconciliations.id,
      fileName: walletReconciliations.fileName,
      periodStart: walletReconciliations.periodStart,
      periodEnd: walletReconciliations.periodEnd,
      rowCount: walletReconciliations.rowCount,
      status: walletReconciliations.status,
      csvTotalAmount: walletReconciliations.csvTotalAmount,
      matchedCount: walletReconciliations.matchedCount,
      matchedAmount: walletReconciliations.matchedAmount,
      discrepancyCount: walletReconciliations.discrepancyCount,
      uploadedBy: walletReconciliations.uploadedBy,
      createdAt: walletReconciliations.createdAt,
    })
    .from(walletReconciliations)
    .where(eq(walletReconciliations.tenantId, ctx.tenantId))
    .orderBy(desc(walletReconciliations.createdAt))
    .limit(limit);

  return NextResponse.json({ success: true, data: list });
}
