import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tripItineraries, tripItineraryItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/trip-itineraries/[id] - 获取行程单详情
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

    const itinerary = await db.query.tripItineraries.findFirst({
      where: and(
        eq(tripItineraries.id, params.id),
        eq(tripItineraries.userId, session.user.id)
      ),
      with: {
        items: true,
      },
    });

    if (!itinerary) {
      return NextResponse.json({ error: '行程单不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: itinerary });
  } catch (error: any) {
    console.error('Get trip itinerary error:', error);
    return NextResponse.json(
      { error: `获取行程单详情失败: ${error?.message || '未知错误'}` },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/trip-itineraries/[id] - 更新行程单
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

    // 验证行程单属于当前用户
    const existing = await db.query.tripItineraries.findFirst({
      where: and(
        eq(tripItineraries.id, params.id),
        eq(tripItineraries.userId, session.user.id)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: '行程单不存在' }, { status: 404 });
    }

    const body = await request.json();
    const {
      title,
      purpose,
      startDate,
      endDate,
      destinations,
      status: itineraryStatus,
      items,
      reimbursementId,
    } = body;

    // 更新行程单主信息
    const updateData: any = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (purpose !== undefined) updateData.purpose = purpose;
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (destinations !== undefined) updateData.destinations = destinations;
    if (itineraryStatus !== undefined) updateData.status = itineraryStatus;
    if (reimbursementId !== undefined) updateData.reimbursementId = reimbursementId;

    // 如果用户修改了内容，标记为 modified
    if (existing.aiGenerated && itineraryStatus !== 'confirmed') {
      updateData.status = 'modified';
    }

    await db
      .update(tripItineraries)
      .set(updateData)
      .where(eq(tripItineraries.id, params.id));

    // 如果提供了新的明细列表，替换现有明细
    if (items !== undefined) {
      // 删除旧明细
      await db
        .delete(tripItineraryItems)
        .where(eq(tripItineraryItems.itineraryId, params.id));

      // 插入新明细
      if (items.length > 0) {
        await db.insert(tripItineraryItems).values(
          items.map((item: any, index: number) => ({
            itineraryId: params.id,
            date: new Date(item.date),
            time: item.time || null,
            type: item.type || 'other',
            category: item.category || null,
            title: item.title,
            description: item.description || null,
            location: item.location || null,
            departure: item.departure || null,
            arrival: item.arrival || null,
            transportNumber: item.transportNumber || null,
            hotelName: item.hotelName || null,
            checkIn: item.checkIn ? new Date(item.checkIn) : null,
            checkOut: item.checkOut ? new Date(item.checkOut) : null,
            amount: item.amount ? parseFloat(item.amount) : null,
            currency: item.currency || null,
            reimbursementItemId: item.reimbursementItemId || null,
            receiptUrl: item.receiptUrl || null,
            sortOrder: item.sortOrder ?? index,
          }))
        );
      }
    }

    // 返回更新后的完整行程单
    const updated = await db.query.tripItineraries.findFirst({
      where: eq(tripItineraries.id, params.id),
      with: {
        items: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Update trip itinerary error:', error);
    return NextResponse.json(
      { error: `更新行程单失败: ${error?.message || '未知错误'}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/trip-itineraries/[id] - 删除行程单
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

    // 验证行程单属于当前用户
    const existing = await db.query.tripItineraries.findFirst({
      where: and(
        eq(tripItineraries.id, params.id),
        eq(tripItineraries.userId, session.user.id)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: '行程单不存在' }, { status: 404 });
    }

    // 级联删除（tripItineraryItems 已设置 onDelete: 'cascade'）
    await db
      .delete(tripItineraries)
      .where(eq(tripItineraries.id, params.id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete trip itinerary error:', error);
    return NextResponse.json(
      { error: `删除行程单失败: ${error?.message || '未知错误'}` },
      { status: 500 }
    );
  }
}
