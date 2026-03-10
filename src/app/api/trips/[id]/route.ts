import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { trips } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/trips/[id] - 获取行程详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const trip = await db.query.trips.findFirst({
      where: and(
        eq(trips.id, params.id),
        eq(trips.userId, session.user.id)
      ),
      with: {
        itineraries: {
          with: { items: true },
        },
        reimbursements: true,
      },
    });

    if (!trip) {
      return NextResponse.json({ error: '行程不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: trip });
  } catch (error: any) {
    console.error('Get trip error:', error);
    return NextResponse.json(
      { error: `获取行程详情失败: ${error?.message || '未知错误'}` },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/trips/[id] - 更新行程
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const existing = await db.query.trips.findFirst({
      where: and(
        eq(trips.id, params.id),
        eq(trips.userId, session.user.id)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: '行程不存在' }, { status: 404 });
    }

    const body = await request.json();
    const updateData: any = { updatedAt: new Date() };

    if (body.title !== undefined) updateData.title = body.title;
    if (body.purpose !== undefined) updateData.purpose = body.purpose;
    if (body.destination !== undefined) updateData.destination = body.destination;
    if (body.startDate !== undefined) updateData.startDate = new Date(body.startDate);
    if (body.endDate !== undefined) updateData.endDate = new Date(body.endDate);
    if (body.status !== undefined) updateData.status = body.status;
    if (body.budget !== undefined) updateData.budget = body.budget;

    const [updated] = await db
      .update(trips)
      .set(updateData)
      .where(eq(trips.id, params.id))
      .returning();

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Update trip error:', error);
    return NextResponse.json(
      { error: `更新行程失败: ${error?.message || '未知错误'}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/trips/[id] - 删除行程
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const existing = await db.query.trips.findFirst({
      where: and(
        eq(trips.id, params.id),
        eq(trips.userId, session.user.id)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: '行程不存在' }, { status: 404 });
    }

    await db.delete(trips).where(eq(trips.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete trip error:', error);
    return NextResponse.json(
      { error: `删除行程失败: ${error?.message || '未知错误'}` },
      { status: 500 }
    );
  }
}
