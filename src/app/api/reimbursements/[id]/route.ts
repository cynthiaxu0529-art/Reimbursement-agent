import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, reimbursementItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// 强制动态渲染，避免构建时预渲染
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/reimbursements/[id] - 获取报销详情
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 先查找报销单（不限制用户，因为审批人也需要查看）
    const reimbursement = await db.query.reimbursements.findFirst({
      where: eq(reimbursements.id, id),
      with: {
        items: true,
        trip: true,
        approvals: true,
      },
    });

    if (!reimbursement) {
      return NextResponse.json({ error: '报销单不存在' }, { status: 404 });
    }

    // 检查权限：必须是自己的报销或同一租户（审批人）
    if (reimbursement.userId !== session.user.id && reimbursement.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: '无权查看此报销单' }, { status: 403 });
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
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 检查报销单是否存在且属于当前用户
    const existing = await db.query.reimbursements.findFirst({
      where: and(
        eq(reimbursements.id, id),
        eq(reimbursements.userId, session.user.id)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: '报销单不存在' }, { status: 404 });
    }

    const body = await request.json();
    const { title, description, items, status: newStatus } = body;

    // 验证状态转换
    const allowedTransitions: Record<string, string[]> = {
      draft: ['pending'],      // 草稿可以提交
      pending: ['draft'],      // 待审批可以撤回
    };

    // 如果有状态变更请求
    if (newStatus && newStatus !== existing.status) {
      if (!allowedTransitions[existing.status]?.includes(newStatus)) {
        return NextResponse.json(
          { error: `无法从 ${existing.status} 状态转换为 ${newStatus}` },
          { status: 400 }
        );
      }
    } else if (existing.status !== 'draft') {
      // 如果不是状态变更，只有草稿可以编辑内容
      return NextResponse.json(
        { error: '只有草稿状态的报销单可以编辑' },
        { status: 400 }
      );
    }

    // 计算总金额
    const totalAmount = items?.reduce(
      (sum: number, item: any) => sum + (parseFloat(item.amount) || 0),
      0
    ) || existing.totalAmount;

    // 确定新状态
    let finalStatus = existing.status;
    let submittedAt: Date | null = existing.submittedAt;

    if (newStatus === 'pending') {
      finalStatus = 'pending';
      submittedAt = new Date();
    } else if (newStatus === 'draft') {
      finalStatus = 'draft';
      // 撤回时清除提交时间
      submittedAt = null;
    }

    // 更新报销单
    const [updated] = await db
      .update(reimbursements)
      .set({
        title: title || existing.title,
        description: description ?? existing.description,
        totalAmount,
        totalAmountInBaseCurrency: totalAmount,
        status: finalStatus,
        submittedAt: submittedAt,
        updatedAt: new Date(),
      })
      .where(eq(reimbursements.id, id))
      .returning();

    // 如果有新的费用明细，删除旧的并创建新的
    if (items && items.length > 0) {
      await db
        .delete(reimbursementItems)
        .where(eq(reimbursementItems.reimbursementId, id));

      await db.insert(reimbursementItems).values(
        items.map((item: any) => ({
          reimbursementId: id,
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
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 检查报销单是否存在且属于当前用户
    const existing = await db.query.reimbursements.findFirst({
      where: and(
        eq(reimbursements.id, id),
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
      .where(eq(reimbursementItems.reimbursementId, id));

    // 删除报销单
    await db
      .delete(reimbursements)
      .where(eq(reimbursements.id, id));

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

/**
 * PATCH /api/reimbursements/[id] - 更新报销单状态（用于审批）
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { status: newStatus, rejectReason, comment } = body;

    // 查找报销单
    const existing = await db.query.reimbursements.findFirst({
      where: eq(reimbursements.id, id),
    });

    if (!existing) {
      return NextResponse.json({ error: '报销单不存在' }, { status: 404 });
    }

    // 检查权限：必须是同一租户（审批人）
    if (existing.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: '无权操作此报销单' }, { status: 403 });
    }

    // 验证状态转换
    const validTransitions: Record<string, string[]> = {
      pending: ['approved', 'rejected', 'under_review'],
      under_review: ['approved', 'rejected'],
      draft: ['pending'],
    };

    if (!validTransitions[existing.status]?.includes(newStatus)) {
      return NextResponse.json(
        { error: `无法从 ${existing.status} 状态转换为 ${newStatus}` },
        { status: 400 }
      );
    }

    // 更新报销单状态
    const updateData: any = {
      status: newStatus,
      updatedAt: new Date(),
    };

    if (newStatus === 'approved') {
      updateData.approvedAt = new Date();
      updateData.approvedBy = session.user.id;
    } else if (newStatus === 'rejected') {
      updateData.rejectedAt = new Date();
      updateData.rejectedBy = session.user.id;
      if (rejectReason) {
        updateData.rejectReason = rejectReason;
      }
    }

    const [updated] = await db
      .update(reimbursements)
      .set(updateData)
      .where(eq(reimbursements.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Update reimbursement status error:', error);
    return NextResponse.json(
      { error: '更新报销单状态失败' },
      { status: 500 }
    );
  }
}
