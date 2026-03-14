/**
 * 内部 API：生成并持久化记账汇总
 *
 * POST /api/internal/generate-summary
 *
 * Body:
 *   { summary_ids: string[] }        — 生成指定周期
 *   { summary_ids: ["all"] }         — 生成所有可用周期
 *
 * GET /api/internal/generate-summary
 *   返回可生成的周期列表及已生成状态
 *
 * 需要 finance 或 super_admin 权限
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserRoles } from '@/lib/auth/roles';
import {
  listAvailablePeriods,
  listGeneratedSummaryIds,
  generateMultipleSummaries,
  generateAndPersistSummary,
} from '@/lib/accounting/generate-summary';

export const dynamic = 'force-dynamic';

async function checkFinanceAccess() {
  const session = await auth();
  if (!session?.user) return { error: '未登录', status: 401 };

  const currentUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!currentUser) return { error: '用户不存在', status: 401 };

  const userRoles = getUserRoles(currentUser);
  const hasAccess = userRoles.some(r => ['finance', 'super_admin'].includes(r));
  if (!hasAccess) return { error: '需要财务权限', status: 403 };

  return { user: currentUser };
}

/**
 * GET: 列出可生成的周期 + 已生成状态
 */
export async function GET() {
  try {
    const accessCheck = await checkFinanceAccess();
    if ('error' in accessCheck) {
      return NextResponse.json({ error: accessCheck.error }, { status: accessCheck.status });
    }

    const [periods, generatedIds] = await Promise.all([
      listAvailablePeriods(),
      listGeneratedSummaryIds(),
    ]);

    const generatedSet = new Set(generatedIds);

    const result = periods.map(p => ({
      summary_id: p.summaryId,
      period_start: formatDate(p.periodStart),
      period_end: formatDate(p.periodEnd),
      label: p.label,
      is_generated: generatedSet.has(p.summaryId),
    }));

    return NextResponse.json({
      success: true,
      periods: result,
      generated_count: generatedIds.length,
      total_count: periods.length,
    });
  } catch (error) {
    console.error('List periods error:', error);
    return NextResponse.json({ error: '获取周期列表失败' }, { status: 500 });
  }
}

/**
 * POST: 生成指定周期的汇总
 */
export async function POST(request: NextRequest) {
  try {
    const accessCheck = await checkFinanceAccess();
    if ('error' in accessCheck) {
      return NextResponse.json({ error: accessCheck.error }, { status: accessCheck.status });
    }

    const body = await request.json();
    let summaryIds: string[] = body.summary_ids;

    if (!summaryIds || !Array.isArray(summaryIds) || summaryIds.length === 0) {
      return NextResponse.json(
        { error: '请提供 summary_ids 数组' },
        { status: 400 }
      );
    }

    // "all" → 生成所有可用周期
    if (summaryIds.length === 1 && summaryIds[0] === 'all') {
      const periods = await listAvailablePeriods();
      summaryIds = periods.map(p => p.summaryId);
    }

    const result = await generateMultipleSummaries(summaryIds);

    return NextResponse.json({
      success: true,
      generated: result.generated,
      skipped: result.skipped,
      errors: result.errors,
      message: `成功生成 ${result.generated.length} 个周期，跳过 ${result.skipped.length} 个（无数据），${result.errors.length} 个出错`,
    });
  } catch (error) {
    console.error('Generate summary error:', error);
    return NextResponse.json({ error: '生成汇总失败' }, { status: 500 });
  }
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
