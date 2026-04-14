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
import { reimbursementItems, users } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getUserRoles } from '@/lib/auth/roles';

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
      return NextResponse.json(
        { error: `以下明细不存在: ${missingIds.join(', ')}` },
        { status: 404 }
      );
    }

    // Fetch current COA values so we can track changes for dedup
    const currentItems = await db
      .select({
        id: reimbursementItems.id,
        coaCode: reimbursementItems.coaCode,
        coaName: reimbursementItems.coaName,
      })
      .from(reimbursementItems)
      .where(inArray(reimbursementItems.id, itemIds));
    const currentCoaMap = new Map(currentItems.map(i => [i.id, { coaCode: i.coaCode, coaName: i.coaName }]));

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
