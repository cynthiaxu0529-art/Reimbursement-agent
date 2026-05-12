/**
 * 内部 API：更新报销明细的 GL 科目映射（单条 + 批量）
 *
 * PATCH /api/internal/update-item-account
 *
 * 单条更新:
 * {
 *   item_id: string;
 *   account_code: string;
 *   account_name: string;
 * }
 *
 * 批量更新:
 * {
 *   items: Array<{ item_id: string; account_code: string; account_name: string }>
 * }
 *
 * 需要 finance 或 super_admin 权限。
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursementItems, users, correctionApplications } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getUserRoles } from '@/lib/auth/roles';
import { loadClosedPeriods, monthIdOf } from '@/lib/accounting/period-closure';

export const dynamic = 'force-dynamic';

interface UpdateItem {
  item_id: string;
  account_code: string;
  account_name: string;
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });
    if (!currentUser) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }

    const userRoles = getUserRoles(currentUser);
    const hasAccess = userRoles.some(r => ['finance', 'super_admin'].includes(r));
    if (!hasAccess) {
      return NextResponse.json({ error: '需要财务权限' }, { status: 403 });
    }

    const body = await request.json();

    // 兼容单条和批量
    let updates: UpdateItem[];

    if (body.items && Array.isArray(body.items)) {
      // 批量模式
      updates = body.items;
    } else if (body.item_id) {
      // 单条模式
      updates = [{
        item_id: body.item_id,
        account_code: body.account_code,
        account_name: body.account_name,
      }];
    } else {
      return NextResponse.json(
        { error: '请提供 item_id 或 items 数组' },
        { status: 400 }
      );
    }

    // 验证
    for (const u of updates) {
      if (!u.item_id || !u.account_code || !u.account_name) {
        return NextResponse.json(
          { error: `缺少必填字段: item_id=${u.item_id}, account_code=${u.account_code}, account_name=${u.account_name}` },
          { status: 400 }
        );
      }
    }

    // 验证所有 item 存在
    const itemIds = updates.map(u => u.item_id);
    const existingItems = await db
      .select({ id: reimbursementItems.id })
      .from(reimbursementItems)
      .where(inArray(reimbursementItems.id, itemIds));

    const existingIds = new Set(existingItems.map(i => i.id));
    const missingIds = itemIds.filter(id => !existingIds.has(id));

    if (missingIds.length > 0) {
      // 区分一下：是真的不存在，还是其实是 correction_applications 的 ID
      // 汇总接口里 correction_application 行的 item_id = application.id
      // 走的是另一张表，且科目固定 1220 不允许在 UI 改
      const correctionMatches = await db
        .select({ id: correctionApplications.id })
        .from(correctionApplications)
        .where(inArray(correctionApplications.id, missingIds));
      const correctionIds = new Set(correctionMatches.map(r => r.id));

      const trulyMissing = missingIds.filter(id => !correctionIds.has(id));
      const correctionConflicts = missingIds.filter(id => correctionIds.has(id));

      if (correctionConflicts.length > 0) {
        return NextResponse.json(
          {
            error: `冲差调整记录不支持修改科目（科目固定为 1220）。请取消勾选这 ${correctionConflicts.length} 条 correction_adjustment 类型的记录后再批量修改。`,
            error_code: 'CORRECTION_NOT_EDITABLE',
            correction_ids: correctionConflicts,
            other_missing_ids: trulyMissing,
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: `以下明细不存在: ${trulyMissing.join(', ')}` },
        { status: 404 }
      );
    }

    // Fetch current COA values so we can track changes for dedup
    const currentItems = await db
      .select({
        id: reimbursementItems.id,
        coaCode: reimbursementItems.coaCode,
        coaName: reimbursementItems.coaName,
        date: reimbursementItems.date,
        postedPeriodId: reimbursementItems.postedPeriodId,
      })
      .from(reimbursementItems)
      .where(inArray(reimbursementItems.id, itemIds));
    const currentCoaMap = new Map(currentItems.map(i => [i.id, { coaCode: i.coaCode, coaName: i.coaName }]));

    // 封账阻拦：item 自然归期所在月份已锁定的不允许改 COA
    // （已锁的期间财务已经对账完毕，改科目会让财报和已发出的报告对不上）
    // super_admin 可以解锁该期间后再改
    if (currentUser.tenantId) {
      const closedMonths = await loadClosedPeriods(currentUser.tenantId);
      const blocked: { id: string; month: string }[] = [];
      for (const it of currentItems) {
        // 若 posted_period_id 已固定，按它所在月判断；否则按 item.date
        let monthKey: string | null = null;
        if (it.postedPeriodId) {
          const m = it.postedPeriodId.match(/^REIMB-SUM-(\d{4})(\d{2})-/);
          if (m) monthKey = `${m[1]}-${m[2]}`;
        } else if (it.date) {
          monthKey = monthIdOf(it.date);
        }
        if (monthKey && closedMonths.get(monthKey) === 'locked') {
          blocked.push({ id: it.id, month: monthKey });
        }
      }
      if (blocked.length > 0) {
        const months = Array.from(new Set(blocked.map(b => b.month))).join(', ');
        return NextResponse.json(
          {
            error: `以下明细所在期间已封账（${months}），不可修改科目。请先解锁期间，或联系 super_admin。`,
            error_code: 'PERIOD_LOCKED',
            blocked_item_ids: blocked.map(b => b.id),
            locked_months: Array.from(new Set(blocked.map(b => b.month))),
          },
          { status: 409 }
        );
      }
    }

    // 逐条更新（因为每条可能有不同的 account_code/account_name）
    const results: { id: string; coaCode: string | null; coaName: string | null }[] = [];
    const now = new Date();

    for (const u of updates) {
      const current = currentCoaMap.get(u.item_id);
      const coaChanged = current && u.account_code !== current.coaCode;

      const [updated] = await db
        .update(reimbursementItems)
        .set({
          coaCode: u.account_code,
          coaName: u.account_name,
          // Track previous COA for accounting agent duplicate prevention
          ...(coaChanged && {
            previousCoaCode: current.coaCode || null,
            previousCoaName: current.coaName || null,
            coaChangedAt: now,
          }),
          updatedAt: now,
        })
        .where(eq(reimbursementItems.id, u.item_id))
        .returning({
          id: reimbursementItems.id,
          coaCode: reimbursementItems.coaCode,
          coaName: reimbursementItems.coaName,
        });

      results.push(updated);
    }

    return NextResponse.json({
      success: true,
      updated_count: results.length,
      data: results,
    });
  } catch (error) {
    console.error('Update item account error:', error);
    return NextResponse.json(
      { error: '更新科目失败', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
