import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, reimbursementItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * GET /api/reimbursements/[id] - 获取报销详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const reimbursement = await db.query.reimbursements.findFirst({
      where: and(
        eq(reimbursements.id, params.id),
        eq(reimbursements.userId, session.user.id)
      ),
      with: {
        items: true,
        trip: true,
        approvals: true,
      },
    });

    if (!reimbursement) {
      return NextResponse.json({ error: '报销单不存在' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: reimbursement,
    });
  } catch (error) {
    console.error('Get reimbursement error:', error);
    return NextResponse.json(
      { error: '获取报销详情失败' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/reimbursements/[id] - 更新报销单
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 检查报销单是否存在且属于当前用户
    const existing = await db.query.reimbursements.findFirst({
      where: and(
        eq(reimbursements.id, params.id),
        eq(reimbursements.userId, session.user.id)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: '报销单不存在' }, { status: 404 });
    }

    // 只有草稿状态可以编辑
    if (existing.status !== 'draft') {
      return NextResponse.json(
        { error: '只有草稿状态的报销单可以编辑' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { title, description, items, status: newStatus } = body;

    // 计算总金额
    const totalAmount = items?.reduce(
      (sum: number, item: any) => sum + (parseFloat(item.amount) || 0),
      0
    ) || existing.totalAmount;

    // 更新报销单
    const [updated] = await db
      .update(reimbursements)
      .set({
        title: title || existing.title,
        description: description ?? existing.description,
        totalAmount,
        totalAmountInBaseCurrency: totalAmount,
        status: newStatus === 'pending' ? 'pending' : existing.status,
        submittedAt: newStatus === 'pending' ? new Date() : existing.submittedAt,
        updatedAt: new Date(),
      })
      .where(eq(reimbursements.id, params.id))
      .returning();

    // 如果有新的费用明细，删除旧的并创建新的
    if (items && items.length > 0) {
      await db
        .delete(reimbursementItems)
        .where(eq(reimbursementItems.reimbursementId, params.id));

      await db.insert(reimbursementItems).values(
        items.map((item: any) => ({
          reimbursementId: params.id,
          category: item.category,
          description: item.description || '',
          amount: parseFloat(item.amount) || 0,
          currency: item.currency || 'CNY',
          amountInBaseCurrency: parseFloat(item.amount) || 0,
          date: new Date(item.date),
          location: item.location || null,
          vendor: item.vendor || null,
          receiptUrl: item.receiptUrl || null,
        }))
      );
    }

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Update reimbursement error:', error);
    return NextResponse.json(
      { error: '更新报销单失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/reimbursements/[id] - 删除报销单
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 检查报销单是否存在且属于当前用户
    const existing = await db.query.reimbursements.findFirst({
      where: and(
        eq(reimbursements.id, params.id),
        eq(reimbursements.userId, session.user.id)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: '报销单不存在' }, { status: 404 });
    }

    // 只有草稿状态可以删除
    if (existing.status !== 'draft') {
      return NextResponse.json(
        { error: '只有草稿状态的报销单可以删除' },
        { status: 400 }
      );
    }

    // 删除费用明细
    await db
      .delete(reimbursementItems)
      .where(eq(reimbursementItems.reimbursementId, params.id));

    // 删除报销单
    await db
      .delete(reimbursements)
      .where(eq(reimbursements.id, params.id));

    return NextResponse.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    console.error('Delete reimbursement error:', error);
    return NextResponse.json(
      { error: '删除报销单失败' },
      { status: 500 }
    );
  }
}
