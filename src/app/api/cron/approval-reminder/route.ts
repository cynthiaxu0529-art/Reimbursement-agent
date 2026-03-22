/**
 * 审批提醒 Cron API
 *
 * 定期检查待审批的报销单，通过 Telegram 提醒审批人
 *
 * 建议每天早上 9:00 (UTC+8) 调用一次
 * GET /api/cron/approval-reminder
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * 也支持手动触发（OpenClaw 通过 API Key 调用）
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { reimbursements, approvalChain, users } from '@/lib/db/schema';
import { eq, and, or, inArray } from 'drizzle-orm';
import {
  sendTelegramMessage,
  formatApprovalReminderMessage,
  checkTelegramConfig,
} from '@/lib/telegram';

export async function GET(request: NextRequest) {
  // 验证 cron secret 或 API Key
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 检查 Telegram 配置
  const telegramCheck = checkTelegramConfig();
  if (!telegramCheck.configured) {
    return NextResponse.json(
      { success: false, error: telegramCheck.error },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3000';

  try {
    // 1. 查询所有 pending 状态的审批链步骤
    const pendingSteps = await db
      .select({
        approverId: approvalChain.approverId,
        reimbursementId: approvalChain.reimbursementId,
        stepName: approvalChain.stepName,
        assignedAt: approvalChain.assignedAt,
      })
      .from(approvalChain)
      .where(eq(approvalChain.status, 'pending'));

    if (pendingSteps.length === 0) {
      return NextResponse.json({
        success: true,
        message: '没有待审批的报销单',
        notified: 0,
      });
    }

    // 2. 获取关联的报销单（仅 pending/under_review）
    const reimbursementIds = [
      ...new Set(pendingSteps.map((s) => s.reimbursementId)),
    ];
    const pendingReimbursements = await db
      .select({
        id: reimbursements.id,
        title: reimbursements.title,
        totalAmount: reimbursements.totalAmount,
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

    const reimbursementMap = new Map(
      pendingReimbursements.map((r) => [r.id, r])
    );

    // 3. 获取所有相关用户信息（审批人 + 提交人）
    const approverIds = [
      ...new Set(
        pendingSteps.map((s) => s.approverId).filter(Boolean) as string[]
      ),
    ];
    const submitterIds = [
      ...new Set(pendingReimbursements.map((r) => r.userId)),
    ];
    const allUserIds = [...new Set([...approverIds, ...submitterIds])];

    const allUsers =
      allUserIds.length > 0
        ? await db
            .select({
              id: users.id,
              name: users.name,
              email: users.email,
              telegramChatId: users.telegramChatId,
            })
            .from(users)
            .where(inArray(users.id, allUserIds))
        : [];

    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    // 4. 按审批人分组
    const approverPendingMap = new Map<
      string,
      Array<{
        id: string;
        title: string;
        submitterName: string;
        totalAmount: number;
        baseCurrency: string;
        submittedAt: string;
        waitingDays: number;
      }>
    >();

    const now = new Date();

    for (const step of pendingSteps) {
      if (!step.approverId) continue;

      const reimbursement = reimbursementMap.get(step.reimbursementId);
      if (!reimbursement) continue;

      const submitter = userMap.get(reimbursement.userId);
      const submittedDate = reimbursement.submittedAt || reimbursement.createdAt;
      const waitingDays = Math.floor(
        (now.getTime() - submittedDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      const items = approverPendingMap.get(step.approverId) || [];
      items.push({
        id: reimbursement.id,
        title: reimbursement.title,
        submitterName: submitter?.name || '未知用户',
        totalAmount: reimbursement.totalAmount,
        baseCurrency: reimbursement.baseCurrency,
        submittedAt: submittedDate.toISOString(),
        waitingDays,
      });
      approverPendingMap.set(step.approverId, items);
    }

    // 5. 逐个审批人发送 Telegram 提醒
    const results: Array<{
      approverId: string;
      approverName: string;
      pendingCount: number;
      sent: boolean;
      error?: string;
    }> = [];

    for (const [approverId, pendingItems] of approverPendingMap) {
      const approver = userMap.get(approverId);
      if (!approver) continue;

      if (!approver.telegramChatId) {
        results.push({
          approverId,
          approverName: approver.name,
          pendingCount: pendingItems.length,
          sent: false,
          error: '未绑定 Telegram',
        });
        continue;
      }

      const message = formatApprovalReminderMessage({
        approverName: approver.name,
        pendingItems,
        appUrl,
      });

      const sendResult = await sendTelegramMessage(
        approver.telegramChatId,
        message
      );

      results.push({
        approverId,
        approverName: approver.name,
        pendingCount: pendingItems.length,
        sent: sendResult.success,
        error: sendResult.error,
      });
    }

    // 6. 同时发送到全局通知群（如果配置了 TELEGRAM_CHAT_ID）
    const globalChatId = process.env.TELEGRAM_CHAT_ID;
    if (globalChatId && pendingReimbursements.length > 0) {
      const summaryLines = [
        `📊 <b>每日审批汇总</b>`,
        ``,
        `当前共有 <b>${pendingReimbursements.length}</b> 笔报销单待审批：`,
        ``,
      ];

      for (const [approverId, items] of approverPendingMap) {
        const approver = userMap.get(approverId);
        summaryLines.push(
          `• ${approver?.name || '未知'}: ${items.length} 笔待审批`
        );
      }

      summaryLines.push(``, `👉 <a href="${appUrl}/approvals">前往审批系统</a>`);

      await sendTelegramMessage(globalChatId, summaryLines.join('\n'));
    }

    const sentCount = results.filter((r) => r.sent).length;

    return NextResponse.json({
      success: true,
      message: `已发送 ${sentCount} 条审批提醒`,
      notified: sentCount,
      totalPending: pendingReimbursements.length,
      details: results,
    });
  } catch (error) {
    console.error('[ApprovalReminder] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: '审批提醒发送失败',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
