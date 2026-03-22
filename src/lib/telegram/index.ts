/**
 * Telegram Bot 通知服务
 * 通过 Telegram Bot API 发送消息（审批提醒等）
 */

export interface TelegramResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

/**
 * 发送 Telegram 消息
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: { parseMode?: 'HTML' | 'MarkdownV2' }
): Promise<TelegramResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN 未配置' };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: options?.parseMode || 'HTML',
        }),
      }
    );

    const data = await res.json();

    if (!data.ok) {
      console.error('[Telegram] Send failed:', data.description);
      return { success: false, error: data.description };
    }

    return { success: true, messageId: data.result?.message_id };
  } catch (error) {
    console.error('[Telegram] Exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '发送失败',
    };
  }
}

/**
 * 检查 Telegram 配置是否完整
 */
export function checkTelegramConfig(): {
  configured: boolean;
  error?: string;
} {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return { configured: false, error: 'TELEGRAM_BOT_TOKEN 未配置' };
  }
  return { configured: true };
}

/**
 * 格式化审批提醒消息
 */
export function formatApprovalReminderMessage(params: {
  approverName: string;
  pendingItems: Array<{
    id: string;
    title: string;
    submitterName: string;
    totalAmount: number;
    baseCurrency: string;
    submittedAt: string;
    waitingDays: number;
  }>;
  appUrl: string;
}): string {
  const { approverName, pendingItems, appUrl } = params;

  const lines: string[] = [
    `📋 <b>审批提醒</b>`,
    ``,
    `${approverName}，您有 <b>${pendingItems.length}</b> 笔报销单待审批：`,
    ``,
  ];

  for (const item of pendingItems) {
    lines.push(
      `• <b>${escapeHtml(item.title)}</b>`,
      `  提交人：${escapeHtml(item.submitterName)}`,
      `  金额：${item.totalAmount.toFixed(2)} ${item.baseCurrency}`,
      `  已等待：${item.waitingDays} 天`,
      ``
    );
  }

  lines.push(`👉 <a href="${appUrl}/approvals">前往审批</a>`);

  return lines.join('\n');
}

/**
 * HTML 转义（Telegram HTML 模式需要转义特殊字符）
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
