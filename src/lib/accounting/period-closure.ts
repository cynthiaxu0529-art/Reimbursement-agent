/**
 * 会计期间封账工具
 *
 * 月度封账（'YYYY-MM'）与半月汇总（'REIMB-SUM-YYYYMM-A/B'）之间的转换 + 查询。
 *
 * 关键概念：
 *   - period_id（封账粒度）：'2026-05'，月度
 *   - summary_id（汇总粒度）：'REIMB-SUM-202605-A'，半月
 *   - 一个月对应两个 summary（A 和 B），封一个月 == 同时封两个 summary
 */

import { db } from '@/lib/db';
import { accountingPeriodClosures } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

/** 从任意日期得到月度封账 ID，如 '2026-05' */
export function monthIdOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** 从半月 summary_id（'REIMB-SUM-202605-A'）反推月份 ID（'2026-05'） */
export function summaryIdToMonthId(summaryId: string): string | null {
  const m = summaryId.match(/^REIMB-SUM-(\d{4})(\d{2})-(A|B)$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

/** 半月周期完整描述 */
export interface HalfMonthPeriod {
  summaryId: string;
  periodStart: Date;
  periodEnd: Date;
  /** 'A' = 1-15, 'B' = 16-月末 */
  label: 'A' | 'B';
}

/** 从日期得到所属半月期完整描述 */
export function halfMonthPeriodOf(date: Date): HalfMonthPeriod {
  const y = date.getFullYear();
  const mo = date.getMonth();
  const d = date.getDate();
  const yearStr = String(y);
  const monthStr = String(mo + 1).padStart(2, '0');

  if (d <= 15) {
    return {
      summaryId: `REIMB-SUM-${yearStr}${monthStr}-A`,
      periodStart: new Date(y, mo, 1),
      periodEnd: new Date(y, mo, 15, 23, 59, 59, 999),
      label: 'A',
    };
  }
  const lastDay = new Date(y, mo + 1, 0).getDate();
  return {
    summaryId: `REIMB-SUM-${yearStr}${monthStr}-B`,
    periodStart: new Date(y, mo, 16),
    periodEnd: new Date(y, mo, lastDay, 23, 59, 59, 999),
    label: 'B',
  };
}

/** 从日期得到所属半月 summary_id（halfMonthPeriodOf 的便捷调用） */
export function summaryIdOf(date: Date): string {
  return halfMonthPeriodOf(date).summaryId;
}

/** 从 summary_id 反推半月期完整描述（pinnedPeriodId 复原用） */
export function halfMonthPeriodFromSummaryId(summaryId: string): HalfMonthPeriod | null {
  const m = summaryId.match(/^REIMB-SUM-(\d{4})(\d{2})-(A|B)$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  if (m[3] === 'A') {
    return {
      summaryId,
      periodStart: new Date(y, mo, 1),
      periodEnd: new Date(y, mo, 15, 23, 59, 59, 999),
      label: 'A',
    };
  }
  const lastDay = new Date(y, mo + 1, 0).getDate();
  return {
    summaryId,
    periodStart: new Date(y, mo, 16),
    periodEnd: new Date(y, mo, lastDay, 23, 59, 59, 999),
    label: 'B',
  };
}

/**
 * 拉取某租户下所有封账记录（只返回非默认 open 的，省查询量）。
 * 返回 Map<month_id, 'locked' | 'open'> —— 不在 map 里的视为 'open'。
 */
export async function loadClosedPeriods(tenantId: string): Promise<Map<string, 'open' | 'locked'>> {
  const rows = await db
    .select({
      periodId: accountingPeriodClosures.periodId,
      status: accountingPeriodClosures.status,
    })
    .from(accountingPeriodClosures)
    .where(eq(accountingPeriodClosures.tenantId, tenantId));

  const m = new Map<string, 'open' | 'locked'>();
  for (const r of rows) m.set(r.periodId, r.status as 'open' | 'locked');
  return m;
}

/**
 * 给定一个 item.date（自然归期）和一组已封月份，决定它实际应该归到哪个 summary_id。
 *
 * 规则：
 *   - 自然月份未封 → 用自然 summary_id
 *   - 自然月份已封 + 未同步过 → 用"当前开放期间"的 summary_id（late filing）
 *   - 自然月份已封 + 已同步（synced_je_id 非空）→ 仍用自然 summary_id（不挪动已入账数据）
 *
 * 返回 { summary_id, lateFiling, originalSummaryId }：
 *   - summary_id：最终归属
 *   - lateFiling：是否被改路由
 *   - originalSummaryId：若改路由，原应归属的半月期；否则 undefined
 */
export interface ResolvedPosting {
  period: HalfMonthPeriod;
  lateFiling: boolean;
  /** 改路由前的自然归期 summary_id，仅 lateFiling 时存在 */
  originalSummaryId?: string;
}

export function resolvePostingPeriod(params: {
  itemDate: Date;
  isSynced: boolean;
  /** 已存在的 posted_period_id；非空时直接用，跳过判断 */
  pinnedPeriodId?: string | null;
  /** 当前时刻（用于决定 late filing 落到哪个开放期间，便于测试时注入） */
  now?: Date;
  closedMonths: Map<string, 'open' | 'locked'>;
}): ResolvedPosting {
  const { itemDate, isSynced, pinnedPeriodId, closedMonths } = params;

  // 已经固定过归期 → 直接用
  if (pinnedPeriodId) {
    const pinned = halfMonthPeriodFromSummaryId(pinnedPeriodId);
    if (pinned) return { period: pinned, lateFiling: false };
    // pinnedPeriodId 格式不对就当没设，落到默认路径
  }

  const naturalPeriod = halfMonthPeriodOf(itemDate);
  const naturalMonth = monthIdOf(itemDate);
  const isLocked = closedMonths.get(naturalMonth) === 'locked';

  if (!isLocked) {
    return { period: naturalPeriod, lateFiling: false };
  }

  // 已封但已同步 → 不动
  if (isSynced) {
    return { period: naturalPeriod, lateFiling: false };
  }

  // 已封且未同步 → 改路由到当前开放期间
  const now = params.now || new Date();
  let cursor = new Date(now);

  // 万一当前月也被封了（不应该但兜底），就一直往后挪到下个未封的月份
  // 防止死循环：最多看 24 个月
  let safety = 24;
  while (closedMonths.get(monthIdOf(cursor)) === 'locked' && safety > 0) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    safety -= 1;
  }

  return {
    period: halfMonthPeriodOf(cursor),
    lateFiling: true,
    originalSummaryId: naturalPeriod.summaryId,
  };
}

function parseMonth(monthId: string): Date {
  const [y, m] = monthId.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

/** 检查某些月份是否已封；返回已封月份集合 */
export async function getLockedMonths(
  tenantId: string,
  monthIds: string[],
): Promise<Set<string>> {
  if (monthIds.length === 0) return new Set();
  const rows = await db
    .select({ periodId: accountingPeriodClosures.periodId })
    .from(accountingPeriodClosures)
    .where(
      and(
        eq(accountingPeriodClosures.tenantId, tenantId),
        inArray(accountingPeriodClosures.periodId, monthIds),
        eq(accountingPeriodClosures.status, 'locked'),
      ),
    );
  return new Set(rows.map(r => r.periodId));
}
