import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, reimbursementItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string; itemId: string }> };

/**
 * DELETE /api/reimbursements/[id]/items/[itemId] - Delete individual expense item
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id, itemId } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // Check if reimbursement exists and belongs to user
    const existing = await db.query.reimbursements.findFirst({
      where: and(
        eq(reimbursements.id, id),
        eq(reimbursements.userId, session.user.id)
      ),
      with: {
        items: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: '报销单不存在' }, { status: 404 });
    }

    // Only allow editing in draft or rejected status
    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      return NextResponse.json(
        { error: '只有草稿或已拒绝状态的报销单可以编辑' },
        { status: 400 }
      );
    }

    // Check if item exists
    const item = existing.items.find(i => i.id === itemId);
    if (!item) {
      return NextResponse.json({ error: '费用明细不存在' }, { status: 404 });
    }

    // Don't allow deleting the last item
    if (existing.items.length <= 1) {
      return NextResponse.json(
        { error: '至少需要保留一项费用明细' },
        { status: 400 }
      );
    }

    // Delete the item
    await db
      .delete(reimbursementItems)
      .where(eq(reimbursementItems.id, itemId));

    // Update total amount
    const remainingItems = existing.items.filter(i => i.id !== itemId);
    const newTotalAmount = remainingItems.reduce(
      (sum, i) => sum + (i.amount || 0),
      0
    );
    const newTotalAmountInBaseCurrency = remainingItems.reduce(
      (sum, i) => sum + (i.amountInBaseCurrency || i.amount || 0),
      0
    );

    await db
      .update(reimbursements)
      .set({
        totalAmount: newTotalAmount,
        totalAmountInBaseCurrency: newTotalAmountInBaseCurrency,
        updatedAt: new Date(),
      })
      .where(eq(reimbursements.id, id));

    return NextResponse.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    console.error('Delete item error:', error);
    return NextResponse.json(
      { error: '删除费用明细失败' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/reimbursements/[id]/items/[itemId] - Update individual expense item
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id, itemId } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // Check if reimbursement exists and belongs to user
    const existing = await db.query.reimbursements.findFirst({
      where: and(
        eq(reimbursements.id, id),
        eq(reimbursements.userId, session.user.id)
      ),
      with: {
        items: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: '报销单不存在' }, { status: 404 });
    }

    // Only allow editing in draft or rejected status
    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      return NextResponse.json(
        { error: '只有草稿或已拒绝状态的报销单可以编辑' },
        { status: 400 }
      );
    }

    // Check if item exists
    const item = existing.items.find(i => i.id === itemId);
    if (!item) {
      return NextResponse.json({ error: '费用明细不存在' }, { status: 404 });
    }

    const body = await request.json();
    const { receiptUrl, vendor, description, amount, currency, category } = body;

    // Build update object
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (receiptUrl !== undefined) {
      updateData.receiptUrl = receiptUrl;
    }
    if (vendor !== undefined) {
      updateData.vendor = vendor;
    }
    if (description !== undefined) {
      updateData.description = description;
    }
    if (amount !== undefined) {
      updateData.amount = parseFloat(amount) || 0;
      updateData.amountInBaseCurrency = body.amountInBaseCurrency || updateData.amount;
    }
    if (currency !== undefined) {
      updateData.currency = currency;
    }
    if (category !== undefined) {
      updateData.category = category;
    }

    // Update the item
    const [updated] = await db
      .update(reimbursementItems)
      .set(updateData)
      .where(eq(reimbursementItems.id, itemId))
      .returning();

    // If amount changed, update reimbursement total
    if (amount !== undefined) {
      const allItems = existing.items.map(i =>
        i.id === itemId ? { ...i, amount: updateData.amount, amountInBaseCurrency: updateData.amountInBaseCurrency } : i
      );
      const newTotalAmount = allItems.reduce(
        (sum, i) => sum + (i.amount || 0),
        0
      );
      const newTotalAmountInBaseCurrency = allItems.reduce(
        (sum, i) => sum + (i.amountInBaseCurrency || i.amount || 0),
        0
      );

      await db
        .update(reimbursements)
        .set({
          totalAmount: newTotalAmount,
          totalAmountInBaseCurrency: newTotalAmountInBaseCurrency,
          updatedAt: new Date(),
        })
        .where(eq(reimbursements.id, id));
    }

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Update item error:', error);
    return NextResponse.json(
      { error: '更新费用明细失败' },
      { status: 500 }
    );
  }
}
