import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { advances, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/advances/:id - 获取预借款详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;

    const advance = await db.query.advances.findFirst({
      where: eq(advances.id, id),
      with: {
        user: true,
        reconciliations: {
          with: {
            reimbursement: true,
          },
        },
      },
    });

    if (!advance) {
      return NextResponse.json({ error: '预借款不存在' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...advance,
        user: advance.user ? { id: advance.user.id, name: advance.user.name, email: advance.user.email } : null,
      },
    });
  } catch (error) {
    console.error('Get advance error:', error);
    return NextResponse.json({ error: '获取预借款详情失败' }, { status: 500 });
  }
}

/**
 * PATCH /api/advances/:id - 更新预借款（仅草稿/待审批状态可编辑）
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;

    const advance = await db.query.advances.findFirst({
      where: eq(advances.id, id),
    });

    if (!advance) {
      return NextResponse.json({ error: '预借款不存在' }, { status: 404 });
    }

    // 只有申请人可以编辑自己的预借款
    if (advance.userId !== session.user.id) {
      return NextResponse.json({ error: '无权编辑此预借款' }, { status: 403 });
    }

    if (advance.status !== 'pending') {
      return NextResponse.json({ error: '只能编辑待审批状态的预借款' }, { status: 400 });
    }

    const body = await request.json();
    const { title, description, purpose, amount, currency } = body;

    const updated = await db.update(advances)
      .set({
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(purpose !== undefined && { purpose }),
        ...(amount && amount > 0 && { amount }),
        ...(currency && { currency }),
        updatedAt: new Date(),
      })
      .where(eq(advances.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      data: updated[0],
    });
  } catch (error) {
    console.error('Update advance error:', error);
    return NextResponse.json({ error: '更新预借款失败' }, { status: 500 });
  }
}

/**
 * DELETE /api/advances/:id - 取消/删除预借款
 * 申请人可取消 pending 状态的预借款
 * 财务/管理员可删除 pending/approved/rejected/cancelled 状态的预借款
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;

    const advance = await db.query.advances.findFirst({
      where: eq(advances.id, id),
    });

    if (!advance) {
      return NextResponse.json({ error: '预借款不存在' }, { status: 404 });
    }

    // 查询当前用户角色
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    const isFinanceOrAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin' || currentUser?.role === 'finance';

    // 财务/管理员可以删除 pending/approved/rejected/cancelled 状态（不能删除已打款或核销中的）
    if (isFinanceOrAdmin) {
      if (['paid', 'reconciling', 'reconciled'].includes(advance.status)) {
        return NextResponse.json({ error: '已打款或核销中的预借款不能删除' }, { status: 400 });
      }

      await db.delete(advances).where(eq(advances.id, id));
      return NextResponse.json({ success: true });
    }

    // 普通用户只能取消自己的 pending 预借款
    if (advance.userId !== session.user.id) {
      return NextResponse.json({ error: '无权取消此预借款' }, { status: 403 });
    }

    if (advance.status !== 'pending') {
      return NextResponse.json({ error: '只能取消待审批状态的预借款' }, { status: 400 });
    }

    const updated = await db.update(advances)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(advances.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      data: updated[0],
    });
  } catch (error) {
    console.error('Delete advance error:', error);
    return NextResponse.json({ error: '删除预借款失败' }, { status: 500 });
  }
}
