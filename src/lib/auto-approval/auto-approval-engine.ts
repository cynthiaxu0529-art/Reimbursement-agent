/**
 * 自动审批主引擎
 * 每次调度时：
 * 1. 处理已超过缓冲期的 queued 记录 → 执行审批
 * 2. 评估新的待审批步骤 → 风控预检 + 规则匹配 → 写入 queued
 */

import { db } from '@/lib/db';
import {
  approvalChain,
  autoApprovalProfiles,
  autoApprovalLogs,
  reimbursements,
  reimbursementItems,
  users,
} from '@/lib/db/schema';
import { eq, and, lte, isNull, inArray } from 'drizzle-orm';
import { runRiskChecks } from './risk-checker';
import { evaluateMemoryRules } from './memory-evaluator';
import { sendEmail } from '@/lib/email';
import { sendTelegramMessage } from '@/lib/telegram';

const APP_URL = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || '';

interface EngineRunResult {
  executed: number;   // 缓冲期到期后执行的条数
  queued: number;     // 新加入缓冲期队列的条数
  skipped: number;    // 风控/规则不命中跳过的条数
  errors: number;
}

/**
 * 调度器主入口，供 cron route 调用
 */
export async function runAutoApprovalEngine(): Promise<EngineRunResult> {
  const result: EngineRunResult = { executed: 0, queued: 0, skipped: 0, errors: 0 };

  try {
    // Phase A：执行已过缓冲期的 queued 记录
    await executeQueuedApprovals(result);

    // Phase B：评估新的待审批步骤
    await evaluatePendingSteps(result);
  } catch (err) {
    console.error('[AutoApproval] Engine error:', err);
    result.errors++;
  }

  return result;
}

// ─────────────────────────────────────────────
// Phase A：执行缓冲期到期的 queued 记录
// ─────────────────────────────────────────────
async function executeQueuedApprovals(result: EngineRunResult) {
  const now = new Date();

  const queuedLogs = await db
    .select()
    .from(autoApprovalLogs)
    .where(
      and(
        eq(autoApprovalLogs.decision, 'queued'),
        lte(autoApprovalLogs.cancelWindowEndsAt, now),
        isNull(autoApprovalLogs.cancelledAt)
      )
    );

  for (const log of queuedLogs) {
    try {
      // 将 approvalChain 步骤标记为 approved
      await db.transaction(async (tx) => {
        await tx
          .update(approvalChain)
          .set({ status: 'approved', completedAt: now, comment: '自动审批（规则触发）', updatedAt: now })
          .where(eq(approvalChain.id, log.approvalChainStepId));

        await tx
          .update(autoApprovalLogs)
          .set({ decision: 'executed', executedAt: now })
          .where(eq(autoApprovalLogs.id, log.id));

        // 更新 profile 统计
        if (log.profileId) {
          const profile = await tx
            .select({ count: autoApprovalProfiles.totalAutoApprovedCount, total: autoApprovalProfiles.totalAutoApprovedUSD })
            .from(autoApprovalProfiles)
            .where(eq(autoApprovalProfiles.id, log.profileId))
            .limit(1);

          if (profile.length > 0) {
            await tx
              .update(autoApprovalProfiles)
              .set({
                totalAutoApprovedCount: (profile[0].count ?? 0) + 1,
                totalAutoApprovedUSD: (profile[0].total ?? 0) + (log.amountUSD ?? 0),
                lastTriggeredAt: now,
                updatedAt: now,
              })
              .where(eq(autoApprovalProfiles.id, log.profileId));
          }
        }
      });

      // 检查是否全部步骤完成，更新报销单状态
      await maybeCompleteReimbursement(log.reimbursementId);

      // 发通知
      await sendAutoApprovalNotification(log.approverId, log.reimbursementId, log.amountUSD ?? 0);

      result.executed++;
    } catch (err) {
      console.error('[AutoApproval] Execute queued log error:', log.id, err);
      result.errors++;
    }
  }
}

// ─────────────────────────────────────────────
// Phase B：评估新的待审批步骤
// ─────────────────────────────────────────────
async function evaluatePendingSteps(result: EngineRunResult) {
  // 查找所有 pending 状态的审批步骤（有 approverId 的）
  const pendingSteps = await db
    .select({
      step: approvalChain,
      reimbursement: reimbursements,
    })
    .from(approvalChain)
    .innerJoin(reimbursements, eq(approvalChain.reimbursementId, reimbursements.id))
    .where(
      and(
        eq(approvalChain.status, 'pending'),
        inArray(reimbursements.status, ['pending', 'under_review'])
      )
    );

  for (const { step, reimbursement } of pendingSteps) {
    if (!step.approverId) continue;

    // 跳过已有 queued 记录的（避免重复入队）
    const existingLog = await db
      .select({ id: autoApprovalLogs.id })
      .from(autoApprovalLogs)
      .where(
        and(
          eq(autoApprovalLogs.approvalChainStepId, step.id),
          inArray(autoApprovalLogs.decision, ['queued', 'executed'])
        )
      )
      .limit(1);

    if (existingLog.length > 0) continue;

    try {
      await evaluateSingleStep(step, reimbursement, result);
    } catch (err) {
      console.error('[AutoApproval] Evaluate step error:', step.id, err);
      result.errors++;
    }
  }
}

async function evaluateSingleStep(
  step: typeof approvalChain.$inferSelect,
  reimbursement: typeof reimbursements.$inferSelect,
  result: EngineRunResult
) {
  const approverId = step.approverId!;

  // 1. 查找审批人的 profile（已启用、未过期）
  const [profile] = await db
    .select()
    .from(autoApprovalProfiles)
    .where(
      and(
        eq(autoApprovalProfiles.userId, approverId),
        eq(autoApprovalProfiles.tenantId, reimbursement.tenantId),
        eq(autoApprovalProfiles.isEnabled, true)
      )
    )
    .limit(1);

  if (!profile) {
    // 该审批人未配置自动审批，跳过
    return;
  }

  // 检查 profile 是否过期
  if (profile.expiresAt && profile.expiresAt < new Date()) {
    return;
  }

  const amountUSD = reimbursement.totalAmountInBaseCurrency ?? reimbursement.totalAmount ?? 0;

  // 2. 风控预检
  const riskResult = await runRiskChecks({
    reimbursementId: reimbursement.id,
    approverId,
    submitterUserId: reimbursement.userId,
    amountUSD,
    complianceStatus: reimbursement.complianceStatus ?? null,
    profileMaxAmountCapUSD: profile.maxAmountCapUSD,
    profileDailyLimitUSD: profile.dailyLimitUSD,
    tenantId: reimbursement.tenantId,
  });

  if (!riskResult.passed) {
    // 写 skipped 日志
    await db.insert(autoApprovalLogs).values({
      tenantId: reimbursement.tenantId,
      reimbursementId: reimbursement.id,
      approvalChainStepId: step.id,
      approverId,
      profileId: profile.id,
      decision: 'skipped',
      skipReason: riskResult.skipReason,
      riskCheckResults: riskResult.checks as Record<string, boolean>,
      amountUSD,
    });
    result.skipped++;
    return;
  }

  // 3. Memory 规则匹配
  const items = await db
    .select({ category: reimbursementItems.category, receiptId: reimbursementItems.receiptId })
    .from(reimbursementItems)
    .where(eq(reimbursementItems.reimbursementId, reimbursement.id));

  const categories = [...new Set(items.map(i => i.category))];
  const hasReceipts = items.some(i => i.receiptId !== null);

  const [submitter] = await db
    .select({ departmentId: users.departmentId })
    .from(users)
    .where(eq(users.id, reimbursement.userId))
    .limit(1);

  const evalResult = await evaluateMemoryRules({
    profileId: profile.id,
    amountUSD,
    categories,
    submitterUserId: reimbursement.userId,
    submitterDepartmentId: submitter?.departmentId ?? null,
    hasReceipts,
  });

  if (!evalResult.matched || evalResult.action === 'skip') {
    // 写 skipped 日志（规则不命中）
    await db.insert(autoApprovalLogs).values({
      tenantId: reimbursement.tenantId,
      reimbursementId: reimbursement.id,
      approvalChainStepId: step.id,
      approverId,
      profileId: profile.id,
      decision: 'skipped',
      skipReason: evalResult.matched ? '规则设定为 skip' : '无匹配的自动审批规则',
      riskCheckResults: riskResult.checks as Record<string, boolean>,
      amountUSD,
    });
    result.skipped++;
    return;
  }

  // 4. 写入 queued（进入缓冲期）
  const cancelWindowEndsAt = new Date(
    Date.now() + profile.cancellationWindowMinutes * 60 * 1000
  );

  await db.insert(autoApprovalLogs).values({
    tenantId: reimbursement.tenantId,
    reimbursementId: reimbursement.id,
    approvalChainStepId: step.id,
    approverId,
    profileId: profile.id,
    decision: 'queued',
    riskCheckResults: riskResult.checks as Record<string, boolean>,
    ruleMatchedName: evalResult.ruleName,
    ruleMatchedId: evalResult.ruleId,
    cancelWindowEndsAt,
    amountUSD,
  });

  result.queued++;
}

// ─────────────────────────────────────────────
// 辅助：检查报销单是否全部审批完成
// ─────────────────────────────────────────────
async function maybeCompleteReimbursement(reimbursementId: string) {
  const steps = await db
    .select({ status: approvalChain.status })
    .from(approvalChain)
    .where(eq(approvalChain.reimbursementId, reimbursementId));

  const allDone = steps.every(s => s.status === 'approved' || s.status === 'skipped');

  if (allDone && steps.length > 0) {
    await db
      .update(reimbursements)
      .set({ status: 'approved', approvedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(reimbursements.id, reimbursementId),
          inArray(reimbursements.status, ['pending', 'under_review'])
        )
      );
  }
}

// ─────────────────────────────────────────────
// 辅助：发送自动审批通知给审批人
// ─────────────────────────────────────────────
async function sendAutoApprovalNotification(
  approverId: string,
  reimbursementId: string,
  amountUSD: number
) {
  try {
    const [approver] = await db
      .select({ email: users.email, name: users.name, telegramChatId: users.telegramChatId })
      .from(users)
      .where(eq(users.id, approverId))
      .limit(1);

    if (!approver) return;

    const [reimbursement] = await db
      .select({ title: reimbursements.title, userId: reimbursements.userId })
      .from(reimbursements)
      .where(eq(reimbursements.id, reimbursementId))
      .limit(1);

    const [submitter] = reimbursement
      ? await db.select({ name: users.name }).from(users).where(eq(users.id, reimbursement.userId)).limit(1)
      : [];

    const link = `${APP_URL}/dashboard/approvals`;
    const subject = `【自动审批通知】已自动批准 $${amountUSD.toFixed(2)} 报销`;
    const html = `
      <p>您好 ${approver.name}，</p>
      <p>您的自动审批规则已触发，以下报销单已自动通过审批：</p>
      <ul>
        <li>报销单：${reimbursement?.title ?? reimbursementId}</li>
        <li>报销人：${submitter?.name ?? '未知'}</li>
        <li>金额：$${amountUSD.toFixed(2)} USD</li>
      </ul>
      <p>如需撤销或查看详情，请访问：<a href="${link}">${link}</a></p>
      <p style="color:#999;font-size:12px">此邮件由系统自动发送，缓冲期内您可通过上方链接取消。</p>
    `;

    await sendEmail({ to: approver.email, subject, html });

    if (approver.telegramChatId) {
      const msg = `✅ 自动审批触发\n报销：${reimbursement?.title ?? reimbursementId}\n报销人：${submitter?.name ?? '未知'}\n金额：$${amountUSD.toFixed(2)}\n\n查看详情：${link}`;
      await sendTelegramMessage(approver.telegramChatId, msg);
    }
  } catch (err) {
    console.error('[AutoApproval] Notification error:', err);
  }
}
