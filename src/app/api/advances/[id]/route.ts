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
 * DELETE /api/advances/:id - 取消预借款
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

    if (advance.userId !== session.user.id) {
      return NextResponse.json({ error: '无权取消此预借款' }, { status: 403 });
    }

    if (!['pending'].includes(advance.status)) {
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
    console.error('Cancel advance error:', error);
    return NextResponse.json({ error: '取消预借款失败' }, { status: 500 });
  }
}
