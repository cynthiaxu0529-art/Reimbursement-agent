/**
 * 待审批报销单轮询 API（供 OpenClaw 等外部 Agent 定时拉取）
 *
 * GET /api/approvals/pending-poll - 获取待审批报销单摘要
 *
 * 限制：同一 API Key 每小时最多请求 1 次
 * 需要 scope: approval:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth/api-key';
import { db } from '@/lib/db';
import { reimbursements, approvalChain, users } from '@/lib/db/schema';
import { eq, and, inArray, or } from 'drizzle-orm';

// 内存级别的简单限流（每个 API Key 每小时 1 次）
const pollTimestamps = new Map<string, number>();

// 每小时清理一次过期记录
const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export async function GET(request: NextRequest) {
  const authResult = await authenticate(request, 'approval:read' as any);
  if (!authResult.success) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: authResult.statusCode }
    );
  }

  const { context } = authResult;

  // 仅 API Key 认证时才强制限流（Session 用户不受限）
  if (context.authType === 'api_key' && context.apiKey?.id) {
    const keyId = context.apiKey.id;
    const now = Date.now();
    const lastPoll = pollTimestamps.get(keyId);

    if (lastPoll && now - lastPoll < POLL_INTERVAL_MS) {
      const retryAfterSec = Math.ceil((POLL_INTERVAL_MS - (now - lastPoll)) / 1000);
      return NextResponse.json(
        {
          success: false,
          error: `轮询频率限制：每小时最多 1 次。请 ${retryAfterSec} 秒后重试。`,
          error_code: 'POLL_RATE_LIMITED',
          retry_after_seconds: retryAfterSec,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSec) },
        }
      );
    }

    pollTimestamps.set(keyId, now);

    // 清理超过 2 小时的旧记录
    for (const [k, ts] of pollTimestamps.entries()) {
      if (now - ts > 2 * POLL_INTERVAL_MS) {
        pollTimestamps.delete(k);
      }
    }
  }

  try {
    // 查询该用户作为审批人、状态为 pending 的审批链步骤
    const pendingSteps = await db
      .select({
        chainId: approvalChain.id,
        reimbursementId: approvalChain.reimbursementId,
        stepOrder: approvalChain.stepOrder,
        stepType: approvalChain.stepType,
        stepName: approvalChain.stepName,
        assignedAt: approvalChain.assignedAt,
      })
      .from(approvalChain)
      .where(
        and(
          eq(approvalChain.approverId, context.userId),
          eq(approvalChain.status, 'pending')
        )
      );

    if (pendingSteps.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { total: 0, polled_at: new Date().toISOString() },
      });
    }

    // 获取关联的报销单（仅 pending 或 under_review 状态）
    const reimbursementIds = [...new Set(pendingSteps.map((s) => s.reimbursementId))];

    const pendingReimbursements = await db
      .select({
        id: reimbursements.id,
        title: reimbursements.title,
        description: reimbursements.description,
        totalAmount: reimbursements.totalAmount,
        totalAmountInBaseCurrency: reimbursements.totalAmountInBaseCurrency,
        baseCurrency: reimbursements.baseCurrency,
        status: reimbursements.status,
        userId: reimbursements.userId,
        submittedAt: reimbursements.submittedAt,
        createdAt: reimbursements.createdAt,
      })
      .from(reimbursements)
      .where(
        and(
          inArray(reimbursements.id, reimbursementIds),
          or(
            eq(reimbursements.status, 'pending'),
            eq(reimbursements.status, 'under_review')
          )
        )
      );

    // 获取提交人信息
    const submitterIds = [...new Set(pendingReimbursements.map((r) => r.userId))];
    const submitters = submitterIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, submitterIds))
      : [];

    const submitterMap = new Map(submitters.map((s) => [s.id, s]));

    // 组装结果
    const now = new Date();
    const data = pendingReimbursements.map((r) => {
      const submitter = submitterMap.get(r.userId);
      const step = pendingSteps.find((s) => s.reimbursementId === r.id);
      const submittedDate = r.submittedAt || r.createdAt;
      const waitingDays = Math.floor(
        (now.getTime() - submittedDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        id: r.id,
        title: r.title,
        description: r.description,
        totalAmount: r.totalAmount,
        totalAmountInBaseCurrency: r.totalAmountInBaseCurrency,
        baseCurrency: r.baseCurrency,
        status: r.status,
        submittedAt: submittedDate.toISOString(),
        waitingDays,
        submitter: submitter
          ? { id: submitter.id, name: submitter.name, email: submitter.email }
          : null,
        approvalStep: step
          ? {
              stepOrder: step.stepOrder,
              stepType: step.stepType,
              stepName: step.stepName,
              assignedAt: step.assignedAt.toISOString(),
            }
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      data,
      meta: {
        total: data.length,
        polled_at: now.toISOString(),
        next_poll_allowed_at: new Date(now.getTime() + POLL_INTERVAL_MS).toISOString(),
      },
    });
  } catch (error) {
    console.error('[Approvals Poll] Error:', error);
    return NextResponse.json(
      { success: false, error: '获取待审批列表失败' },
      { status: 500 }
    );
  }
}
