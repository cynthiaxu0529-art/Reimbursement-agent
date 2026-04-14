/**
 * POST /api/reimbursement-summaries/mark-synced
 *
 * Accounting Agent 调用此接口，将报销明细标记为已同步到外部 JE。
 * 这样在后续拉取汇总时，已同步的明细会携带 synced_je_id，
 * 防止重复创建 JE（特别是在科目变更后）。
 *
 * 认证方式：API Key（需要 accounting_summary:write scope）或 Service Account
 *
 * 请求体：
 * {
 *   items: Array<{
 *     item_id: string;       // 报销明细 ID
 *     je_id: string;         // 外部 JE 编号（如 "JE-99"）
 *   }>
 * }
 *
 * 响应：
 * {
 *   success: true,
 *   synced_count: number,
 *   items: Array<{ item_id: string; synced_je_id: string; synced_at: string }>
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { reimbursementItems } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { authenticateServiceAccount, isServiceKeyRequest } from '@/lib/auth/service-account';
import { authenticate, logAgentAction, type AuthContext } from '@/lib/auth/api-key';
import { API_SCOPES } from '@/lib/auth/scopes';

export const dynamic = 'force-dynamic';

interface SyncItem {
  item_id: string;
  je_id: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let authCtx: AuthContext | null = null;

  try {
    // 1. Authentication
    if (isServiceKeyRequest(request)) {
      const saResult = await authenticateServiceAccount(request, 'write:reimbursement_summaries');
      if (!saResult.success) {
        return NextResponse.json(
          { error: saResult.error.error, code: saResult.error.code },
          { status: saResult.error.statusCode }
        );
      }
    } else {
      const akResult = await authenticate(request, API_SCOPES.ACCOUNTING_SUMMARY_WRITE);
      if (!akResult.success) {
        return NextResponse.json(
          { error: akResult.error },
          { status: akResult.statusCode }
        );
      }
      authCtx = akResult.context;
    }

    // 2. Parse request body
    const body = await request.json();
    const { items } = body as { items?: SyncItem[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: '请提供 items 数组，每项包含 item_id 和 je_id' },
        { status: 400 }
      );
    }

    // Validate all items have required fields
    for (const item of items) {
      if (!item.item_id || !item.je_id) {
        return NextResponse.json(
          { error: `缺少必填字段: item_id=${item.item_id}, je_id=${item.je_id}` },
          { status: 400 }
        );
      }
    }

    // 3. Verify all items exist
    const itemIds = items.map(i => i.item_id);
    const existingItems = await db
      .select({ id: reimbursementItems.id })
      .from(reimbursementItems)
      .where(inArray(reimbursementItems.id, itemIds));

    const existingIds = new Set(existingItems.map(i => i.id));
    const missingIds = itemIds.filter(id => !existingIds.has(id));
    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: `以下明细不存在: ${missingIds.join(', ')}` },
        { status: 404 }
      );
    }

    // 4. Update sync status for each item
    const now = new Date();
    const results: Array<{ item_id: string; synced_je_id: string; synced_at: string }> = [];

    for (const item of items) {
      await db
        .update(reimbursementItems)
        .set({
          syncedJeId: item.je_id,
          syncedAt: now,
          updatedAt: now,
        })
        .where(eq(reimbursementItems.id, item.item_id));

      results.push({
        item_id: item.item_id,
        synced_je_id: item.je_id,
        synced_at: now.toISOString(),
      });
    }

    // 5. Audit log
    if (authCtx?.authType === 'api_key' && authCtx.apiKey) {
      logAgentAction({
        tenantId: authCtx.tenantId!,
        apiKeyId: authCtx.apiKey.id,
        userId: authCtx.userId,
        action: 'accounting_summary:write',
        method: 'POST',
        path: '/api/reimbursement-summaries/mark-synced',
        statusCode: 200,
        agentType: authCtx.apiKey.agentType,
        requestSummary: { itemCount: items.length },
        responseSummary: { syncedCount: results.length },
        entityType: 'accounting_summary',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        durationMs: Date.now() - startTime,
      });
    }

    return NextResponse.json({
      success: true,
      synced_count: results.length,
      items: results,
    });
  } catch (error) {
    console.error('Mark synced error:', error);
    return NextResponse.json(
      { error: '标记同步状态失败' },
      { status: 500 }
    );
  }
}
