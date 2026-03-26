import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { advances, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * POST /api/advances/:id/approve - 审批预借款（批准/拒绝）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 只有财务/管理员可以审批
    if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'finance') {
      return NextResponse.json({ error: '无权审批预借款' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, reason } = body; // action: 'approve' | 'reject'

    const advance = await db.query.advances.findFirst({
      where: eq(advances.id, id),
    });

    if (!advance) {
      return NextResponse.json({ error: '预借款不存在' }, { status: 404 });
    }

    // 付款操作：approved → paid
    if (action === 'pay') {
      if (advance.status !== 'approved') {
        return NextResponse.json({ error: '只能对已批准的预借款进行付款' }, { status: 400 });
      }
      const updated = await db.update(advances)
        .set({
          status: 'paid',
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(advances.id, id))
        .returning();

      return NextResponse.json({ success: true, data: updated[0] });
    }

    // 撤回付款：paid → approved（用于修正无实际打款记录的情况）
    if (action === 'revert_pay') {
      if (advance.status !== 'paid') {
        return NextResponse.json({ error: '只能撤回已打款状态的预借款' }, { status: 400 });
      }
      const updated = await db.update(advances)
        .set({
          status: 'approved',
          paidAt: null,
          paymentId: null,
          updatedAt: new Date(),
        })
        .where(eq(advances.id, id))
        .returning();

      return NextResponse.json({ success: true, data: updated[0] });
    }

    // 驳回操作：pending 或 approved 都可以驳回
    if (action === 'reject') {
      if (advance.status !== 'pending' && advance.status !== 'approved') {
        return NextResponse.json({ error: '只能驳回待审批或已批准的预借款' }, { status: 400 });
      }
      const updated = await db.update(advances)
        .set({
          status: 'rejected',
          rejectedBy: user.id,
          rejectedAt: new Date(),
          rejectReason: reason || '',
          updatedAt: new Date(),
        })
        .where(eq(advances.id, id))
        .returning();

      return NextResponse.json({ success: true, data: updated[0] });
    }

    if (advance.status !== 'pending') {
      return NextResponse.json({ error: '只能审批待审批状态的预借款' }, { status: 400 });
    }

    if (action === 'approve') {
      const updated = await db.update(advances)
        .set({
          status: 'approved',
          approvedBy: user.id,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(advances.id, id))
        .returning();

      return NextResponse.json({ success: true, data: updated[0] });
    } else {
      return NextResponse.json({ error: '无效的操作' }, { status: 400 });
    }
  } catch (error) {
    console.error('Approve advance error:', error);
    return NextResponse.json({ error: '审批预借款失败' }, { status: 500 });
  }
}
