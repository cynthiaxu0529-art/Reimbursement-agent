/**
 * 外部 API：触发生成并持久化记账汇总
 *
 * POST /api/reimbursement-summaries/generate
 *
 * 供 OpenClaw 等外部 Agent 调用来触发汇总生成。
 *
 * 认证（任选其一）：
 *   1. X-Service-Key header（Service Account，需要 read:reimbursement_summaries 权限）
 *   2. Authorization: Bearer rk_*（API Key，需要 accounting_summary:generate scope）
 *
 * Body:
 *   { "summary_ids": ["REIMB-SUM-202601-B", "REIMB-SUM-202602-A"] }
 *   { "summary_ids": ["all"] }  — 生成所有可用周期
 *   { "year": 2026, "month": 2 }  — 生成该月两个半月周期
 *   { "year": 2026, "month": 2, "half": "B" }  — 生成指定半月周期
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateServiceAccount, isServiceKeyRequest } from '@/lib/auth/service-account';
import { authenticate, logAgentAction, type AuthContext } from '@/lib/auth/api-key';
import { API_SCOPES } from '@/lib/auth/scopes';
import {
  buildSummaryId,
  listAvailablePeriods,
  generateMultipleSummaries,
} from '@/lib/accounting/generate-summary';

export const dynamic = 'force-dynamic';

function withRateHeaders(response: NextResponse, authCtx: AuthContext): NextResponse {
  if (authCtx.rateLimit) {
    response.headers.set('X-RateLimit-Limit', String(authCtx.rateLimit.limit));
    response.headers.set('X-RateLimit-Remaining', String(authCtx.rateLimit.remaining));
    response.headers.set('X-RateLimit-Reset', String(authCtx.rateLimit.resetAt));
  }
  return response;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let authCtx: AuthContext | null = null;

  try {
    // 1. 认证
    if (isServiceKeyRequest(request)) {
      const saResult = await authenticateServiceAccount(request, 'read:reimbursement_summaries');
      if (!saResult.success) {
        return NextResponse.json(
          { error: saResult.error.error, code: saResult.error.code },
          { status: saResult.error.statusCode }
        );
      }
    } else {
      const akResult = await authenticate(request, API_SCOPES.ACCOUNTING_SUMMARY_GENERATE);
      if (!akResult.success) {
        return NextResponse.json(
          { error: akResult.error },
          { status: akResult.statusCode }
        );
      }
      authCtx = akResult.context;
    }

    // 2. 解析 body
    const body = await request.json();
    let summaryIds: string[] = [];

    if (body.summary_ids && Array.isArray(body.summary_ids)) {
      summaryIds = body.summary_ids;
    } else if (body.year && body.month) {
      // 按年月生成
      const year = Number(body.year);
      const month = Number(body.month);
      if (body.half) {
        summaryIds = [buildSummaryId(year, month, body.half as 'A' | 'B')];
      } else {
        summaryIds = [
          buildSummaryId(year, month, 'A'),
          buildSummaryId(year, month, 'B'),
        ];
      }
    } else {
      return NextResponse.json(
        { error: 'Request body must contain summary_ids array, or year+month' },
        { status: 400 }
      );
    }

    // "all" → 生成所有可用周期
    if (summaryIds.length === 1 && summaryIds[0] === 'all') {
      const periods = await listAvailablePeriods();
      summaryIds = periods.map(p => p.summaryId);
    }

    if (summaryIds.length === 0) {
      return NextResponse.json({
        success: true,
        generated: [],
        skipped: [],
        errors: [],
        message: 'No periods to generate',
      });
    }

    // 3. 执行生成
    const result = await generateMultipleSummaries(summaryIds);

    const response = NextResponse.json({
      success: true,
      generated: result.generated,
      skipped: result.skipped,
      errors: result.errors,
      message: `Generated ${result.generated.length} periods, skipped ${result.skipped.length} (no data), ${result.errors.length} errors`,
    });

    // 审计日志
    if (authCtx?.authType === 'api_key' && authCtx.apiKey) {
      logAgentAction({
        tenantId: authCtx.tenantId!,
        apiKeyId: authCtx.apiKey.id,
        userId: authCtx.userId,
        action: 'accounting_summary:generate',
        method: 'POST',
        path: '/api/reimbursement-summaries/generate',
        statusCode: 200,
        agentType: authCtx.apiKey.agentType,
        requestSummary: { summary_ids: summaryIds },
        responseSummary: {
          generated: result.generated.length,
          skipped: result.skipped.length,
          errors: result.errors.length,
        },
        entityType: 'accounting_summary',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        durationMs: Date.now() - startTime,
      });
      return withRateHeaders(response, authCtx);
    }

    return response;
  } catch (error) {
    console.error('Generate summaries error:', error);
    return NextResponse.json(
      { error: 'Failed to generate summaries' },
      { status: 500 }
    );
  }
}
