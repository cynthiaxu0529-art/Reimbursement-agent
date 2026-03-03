/**
 * 内部 API：更新报销明细的 GL 科目映射
 *
 * PATCH /api/internal/update-item-account
 *
 * 请求体:
 * {
 *   item_id: string;
 *   account_code: string;
 *   account_name: string;
 * }
 *
 * 需要 finance 或 admin 权限。
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursementItems, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserRoles } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

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
    const hasAccess = userRoles.some(r => ['finance', 'admin', 'super_admin'].includes(r));
    if (!hasAccess) {
      return NextResponse.json({ error: '需要财务或管理员权限' }, { status: 403 });
    }

    const body = await request.json();
    const { item_id, account_code, account_name } = body;

    if (!item_id || !account_code || !account_name) {
      return NextResponse.json({ error: '缺少必填字段: item_id, account_code, account_name' }, { status: 400 });
    }

    // 查找明细
    const item = await db.query.reimbursementItems.findFirst({
      where: eq(reimbursementItems.id, item_id),
    });

    if (!item) {
      return NextResponse.json({ error: '报销明细不存在' }, { status: 404 });
    }

    // 更新科目
    const [updated] = await db
      .update(reimbursementItems)
      .set({
        coaCode: account_code,
        coaName: account_name,
        updatedAt: new Date(),
      })
      .where(eq(reimbursementItems.id, item_id))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        coaCode: updated.coaCode,
        coaName: updated.coaName,
      },
    });
  } catch (error) {
    console.error('Update item account error:', error);
    return NextResponse.json({ error: '更新科目失败' }, { status: 500 });
  }
}
