/**
 * 自动付款引擎
 * 检查已全部审批通过的报销单，满足付款条件时自动发起 Fluxa 打款
 */

import { db } from '@/lib/db';
import {
  reimbursements,
  payments,
  users,
  autoPaymentProfiles,
  auditLogs,
} from '@/lib/db/schema';
import { eq, and, notInArray, sum, gte } from 'drizzle-orm';
import { createFluxaPayoutService } from '@/lib/fluxa-payout';
import { sendEmail } from '@/lib/email';
import { sendTelegramMessage } from '@/lib/telegram';

const SYSTEM_MAX_PAYMENT_USD = 500;  // 自动付款的系统硬上限（不超过审批上限）
const APP_URL = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || '';

interface PaymentConditions {
  maxAmountPerReimbursementUSD: number;
  maxDailyTotalUSD: number;
  minHoursAfterFinalApproval: number;
  requirePolicyPassed: boolean;
  employeeMinTenureDays: number;
  allowedDepartmentIds?: string[];
  blockedCategories?: string[];
}

interface EngineRunResult {
  initiated: number;
  skipped: number;
  errors: number;
}

/**
 * 调度器主入口
 */
export async function runAutoPaymentEngine(): Promise<EngineRunResult> {
  const result: EngineRunResult = { initiated: 0, skipped: 0, errors: 0 };

  // 查找所有启用的付款配置（非紧急暂停、未过期）
  const profiles = await db
    .select()
    .from(autoPaymentProfiles)
    .where(
      and(
        eq(autoPaymentProfiles.isEnabled, true),
        eq(autoPaymentProfiles.emergencyPause, false)
      )
    );

  for (const profile of profiles) {
    // 检查是否过期
    if (profile.expiresAt && profile.expiresAt < new Date()) continue;

    try {
      await processProfilePayments(profile, result);
    } catch (err) {
      console.error('[AutoPayment] Profile error:', profile.id, err);
      result.errors++;
    }
  }

  return result;
}

async function processProfilePayments(
  profile: typeof autoPaymentProfiles.$inferSelect,
  result: EngineRunResult
) {
  const conditions = profile.conditions as PaymentConditions;
  const maxAmount = Math.min(
    conditions.maxAmountPerReimbursementUSD ?? SYSTEM_MAX_PAYMENT_USD,
    SYSTEM_MAX_PAYMENT_USD
  );
  const minHours = conditions.minHoursAfterFinalApproval ?? 24;
  const minTenureDays = conditions.employeeMinTenureDays ?? 90;

  // 计算今日已自动付款总额（此 profile 当日）
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // 查询今日通过该配置已付款的总额（通过 auditLogs 记录）
  // 简化：通过 payments 表统计今日由系统发起的付款
  const [dailyTotals] = await db
    .select({ total: sum(payments.amount) })
    .from(payments)
    .where(
      and(
        eq(payments.paymentProvider, 'fluxa'),
        gte(payments.createdAt, todayStart)
      )
    );

  let dailyTotalUSD = Number(dailyTotals?.total ?? 0);
  const maxDailyTotal = conditions.maxDailyTotalUSD ?? 1000;

  // 找到已 approved、无付款记录、审批时间满足等待期的报销单
  const cutoffTime = new Date(Date.now() - minHours * 60 * 60 * 1000);

  const eligibleReimbursements = await db
    .select({ reimbursement: reimbursements, user: users })
    .from(reimbursements)
    .innerJoin(users, eq(reimbursements.userId, users.id))
    .where(
      and(
        eq(reimbursements.tenantId, profile.tenantId),
        eq(reimbursements.status, 'approved'),
        // 审批通过时间满足等待期
        // approvedAt <= cutoffTime
        // Note: using lte would need import, using raw comparison
      )
    );

  for (const { reimbursement, user } of eligibleReimbursements) {
    // 检查审批通过时间
    if (!reimbursement.approvedAt || reimbursement.approvedAt > cutoffTime) {
      result.skipped++;
      continue;
    }

    // 检查是否已有付款记录
    const existingPayment = await db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.reimbursementId, reimbursement.id),
          notInArray(payments.status, ['failed', 'expired', 'cancelled'])
        )
      )
      .limit(1);

    if (existingPayment.length > 0) continue;

    const amountUSD = reimbursement.totalAmountInBaseCurrency ?? reimbursement.totalAmount ?? 0;

    // 金额上限检查
    if (amountUSD > maxAmount) {
      result.skipped++;
      continue;
    }

    // 单日总额检查
    if (dailyTotalUSD + amountUSD > maxDailyTotal) {
      console.log(`[AutoPayment] Daily limit reached ($${dailyTotalUSD.toFixed(2)} + $${amountUSD.toFixed(2)} > $${maxDailyTotal})`);
      break;
    }

    // 合规检查
    if (conditions.requirePolicyPassed !== false && reimbursement.complianceStatus !== 'passed') {
      result.skipped++;
      continue;
    }

    // 员工在职天数检查
    const tenureDays = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (tenureDays < minTenureDays) {
      result.skipped++;
      continue;
    }

    // 部门白名单检查
    if (conditions.allowedDepartmentIds && conditions.allowedDepartmentIds.length > 0) {
      if (!user.departmentId || !conditions.allowedDepartmentIds.includes(user.departmentId)) {
        result.skipped++;
        continue;
      }
    }

    // 钱包地址检查
    const walletInfo = user.bankAccount as { walletAddress?: string } | null;
    if (!walletInfo?.walletAddress) {
      result.skipped++;
      continue;
    }

    const evmAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!evmAddressRegex.test(walletInfo.walletAddress)) {
      result.skipped++;
      continue;
    }

    // 发起 Fluxa 打款
    try {
      await initiateAutoPayment(reimbursement, user, walletInfo.walletAddress, amountUSD, profile.id);
      dailyTotalUSD += amountUSD;
      result.initiated++;

      // 更新 profile 统计
      await db
        .update(autoPaymentProfiles)
        .set({
          totalAutoPaymentCount: (profile.totalAutoPaymentCount ?? 0) + 1,
          totalAutoPaymentUSD: (profile.totalAutoPaymentUSD ?? 0) + amountUSD,
          updatedAt: new Date(),
        })
        .where(eq(autoPaymentProfiles.id, profile.id));
    } catch (err) {
      console.error('[AutoPayment] Initiate error:', reimbursement.id, err);
      result.errors++;
    }
  }
}

async function initiateAutoPayment(
  reimbursement: typeof reimbursements.$inferSelect,
  user: typeof users.$inferSelect,
  walletAddress: string,
  amountUSD: number,
  profileId: string
) {
  const payoutService = createFluxaPayoutService();
  if (!payoutService.isConfigured()) {
    throw new Error('Fluxa payout service not configured');
  }

  const payoutResult = await payoutService.initiateReimbursementPayout(
    reimbursement.id,
    walletAddress,
    amountUSD,
    `自动付款 - ${reimbursement.title}`,
    { userName: user.name, userEmail: user.email, reimbursementTitle: reimbursement.title }
  );

  if (!payoutResult.success || !payoutResult.payoutId) {
    throw new Error(payoutResult.error?.message ?? '自动付款失败');
  }

  const now = new Date();

  await db.insert(payments).values({
    reimbursementId: reimbursement.id,
    amount: amountUSD,
    currency: 'USDC',
    transactionId: payoutResult.payoutId,
    paymentProvider: 'fluxa',
    status: 'pending_authorization',
    payoutId: payoutResult.payoutId,
    approvalUrl: payoutResult.approvalUrl,
    payoutStatus: payoutResult.status,
    expiresAt: payoutResult.expiresAt ? new Date(payoutResult.expiresAt * 1000) : null,
    toAddress: walletAddress,
    initiatedBy: null,  // 系统自动发起
    updatedAt: now,
  });

  await db
    .update(reimbursements)
    .set({ status: 'processing', updatedAt: now })
    .where(eq(reimbursements.id, reimbursement.id));

  // 写审计日志
  await db.insert(auditLogs).values({
    tenantId: reimbursement.tenantId,
    userId: null,
    action: 'auto_payment_initiated',
    entityType: 'reimbursement',
    entityId: reimbursement.id,
    newValue: { payoutId: payoutResult.payoutId, amountUSD, profileId },
    metadata: { autoPaymentProfileId: profileId },
  });

  // 通知财务（发邮件）
  await sendAutoPaymentNotification(reimbursement, user, amountUSD, payoutResult.approvalUrl);
}

async function sendAutoPaymentNotification(
  reimbursement: typeof reimbursements.$inferSelect,
  employee: typeof users.$inferSelect,
  amountUSD: number,
  approvalUrl?: string
) {
  try {
    // 通知财务团队
    const financeEmail = process.env.FINANCE_NOTIFICATION_EMAIL;
    if (financeEmail) {
      await sendEmail({
        to: financeEmail,
        subject: `【自动付款通知】已自动发起 $${amountUSD.toFixed(2)} 打款`,
        html: `
          <p>自动付款已触发：</p>
          <ul>
            <li>报销单：${reimbursement.title}</li>
            <li>员工：${employee.name} (${employee.email})</li>
            <li>金额：$${amountUSD.toFixed(2)} USDC</li>
            ${approvalUrl ? `<li>Fluxa 审批链接：<a href="${approvalUrl}">${approvalUrl}</a></li>` : ''}
          </ul>
          <p>如有异常请立即暂停自动付款：<a href="${APP_URL}/dashboard/settings/auto-payment">${APP_URL}/dashboard/settings/auto-payment</a></p>
        `,
      });
    }

    // 通知员工
    await sendEmail({
      to: employee.email,
      subject: `【付款通知】您的报销 $${amountUSD.toFixed(2)} 正在处理`,
      html: `
        <p>您好 ${employee.name}，</p>
        <p>您的报销单「${reimbursement.title}」已通过审批，系统已自动发起打款：</p>
        <ul>
          <li>金额：$${amountUSD.toFixed(2)} USDC</li>
          <li>付款到您绑定的钱包地址</li>
        </ul>
        <p>资金到账时间取决于区块链确认速度，通常在 1-10 分钟内完成。</p>
      `,
    });
  } catch (err) {
    console.error('[AutoPayment] Notification error:', err);
  }
}
