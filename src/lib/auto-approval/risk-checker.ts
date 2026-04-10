/**
 * 自动审批风控预检（硬规则）
 * 所有检查均为强制执行，不可通过配置绕过。
 */

import { db } from '@/lib/db';
import { users, reimbursements, autoApprovalLogs } from '@/lib/db/schema';
import { eq, and, gte, sum } from 'drizzle-orm';

// 系统级硬上限（不可被任何配置覆盖）
export const SYSTEM_MAX_AMOUNT_USD = 500;
export const SYSTEM_DAILY_LIMIT_USD = 2000;
export const SYSTEM_MIN_TENURE_DAYS = 90;

export interface RiskCheckInput {
  reimbursementId: string;
  approverId: string;        // 当前审批步骤的审批人
  submitterUserId: string;   // 报销人
  amountUSD: number;
  complianceStatus: string | null;
  profileMaxAmountCapUSD: number;
  profileDailyLimitUSD: number;
  tenantId: string;
}

export interface RiskCheckResult {
  passed: boolean;
  skipReason?: string;
  checks: {
    amountUnderSystemCap: boolean;        // 金额 <= $500
    amountUnderProfileCap: boolean;       // 金额 <= 审批人个人上限
    notSelfApproval: boolean;             // 审批人 ≠ 报销人
    submitterTenureOk: boolean;           // 报销人在职 >= 90天
    policyPassed: boolean;                // 合规检查通过
    dailyLimitOk: boolean;               // 单日累计未超上限
  };
}

/**
 * 执行所有硬规则检查
 * 任何一项不通过即返回 passed=false 并附上跳过原因
 */
export async function runRiskChecks(input: RiskCheckInput): Promise<RiskCheckResult> {
  const checks = {
    amountUnderSystemCap: false,
    amountUnderProfileCap: false,
    notSelfApproval: false,
    submitterTenureOk: false,
    policyPassed: false,
    dailyLimitOk: false,
  };

  // 1. 金额 <= 系统硬上限 $500
  checks.amountUnderSystemCap = input.amountUSD <= SYSTEM_MAX_AMOUNT_USD;
  if (!checks.amountUnderSystemCap) {
    return { passed: false, skipReason: `金额 $${input.amountUSD.toFixed(2)} 超过系统自动审批上限 $${SYSTEM_MAX_AMOUNT_USD}`, checks };
  }

  // 2. 金额 <= 审批人个人配置上限
  checks.amountUnderProfileCap = input.amountUSD <= input.profileMaxAmountCapUSD;
  if (!checks.amountUnderProfileCap) {
    return { passed: false, skipReason: `金额 $${input.amountUSD.toFixed(2)} 超过审批人设置的上限 $${input.profileMaxAmountCapUSD}`, checks };
  }

  // 3. 禁止自我审批
  checks.notSelfApproval = input.approverId !== input.submitterUserId;
  if (!checks.notSelfApproval) {
    return { passed: false, skipReason: '审批人与报销人相同，禁止自我审批', checks };
  }

  // 4. 报销人在职满 90 天
  const [submitter] = await db.select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, input.submitterUserId))
    .limit(1);

  if (submitter) {
    const tenureDays = (Date.now() - submitter.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    checks.submitterTenureOk = tenureDays >= SYSTEM_MIN_TENURE_DAYS;
  }
  if (!checks.submitterTenureOk) {
    return { passed: false, skipReason: `报销人入职不足 ${SYSTEM_MIN_TENURE_DAYS} 天，需人工审批`, checks };
  }

  // 5. 合规检查必须通过
  checks.policyPassed = input.complianceStatus === 'passed';
  if (!checks.policyPassed) {
    return {
      passed: false,
      skipReason: `合规状态为 "${input.complianceStatus || 'pending'}"，须全部通过方可自动审批`,
      checks,
    };
  }

  // 6. 审批人当日自动审批累计未超 dailyLimitUSD
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [dailyTotal] = await db
    .select({ total: sum(autoApprovalLogs.amountUSD) })
    .from(autoApprovalLogs)
    .where(
      and(
        eq(autoApprovalLogs.approverId, input.approverId),
        eq(autoApprovalLogs.decision, 'executed'),
        gte(autoApprovalLogs.createdAt, todayStart)
      )
    );

  const dailyTotalUSD = Number(dailyTotal?.total ?? 0);
  checks.dailyLimitOk = (dailyTotalUSD + input.amountUSD) <= input.profileDailyLimitUSD;
  if (!checks.dailyLimitOk) {
    return {
      passed: false,
      skipReason: `今日自动审批累计 $${dailyTotalUSD.toFixed(2)} + 本单 $${input.amountUSD.toFixed(2)} 超过单日上限 $${input.profileDailyLimitUSD}`,
      checks,
    };
  }

  return { passed: true, checks };
}
