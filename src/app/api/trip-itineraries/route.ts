import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tripItineraries, tripItineraryItems, reimbursements } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/trip-itineraries - 获取用户的行程单列表
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const reimbursementId = searchParams.get('reimbursementId');

    const conditions: any[] = [eq(tripItineraries.userId, session.user.id)];

    if (reimbursementId) {
      conditions.push(eq(tripItineraries.reimbursementId, reimbursementId));
    }

    const list = await db.query.tripItineraries.findMany({
      where: and(...conditions),
      orderBy: [desc(tripItineraries.createdAt)],
      with: {
        items: true,
      },
    });

    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    console.error('Get trip itineraries error:', error);
    return NextResponse.json(
      { error: `获取行程单列表失败: ${error?.message || '未知错误'}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/trip-itineraries - 保存行程单（含明细）
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
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
      tripId,
    } = body;

    if (!title) {
      return NextResponse.json({ error: '行程标题不能为空' }, { status: 400 });
    }

    // 获取用户的 tenantId
    const user = await db.query.users.findFirst({
      where: eq(
        (await import('@/lib/db/schema')).users.id,
        session.user.id
      ),
      columns: { tenantId: true },
    });

    const tenantId = user?.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { error: '请先在设置中创建或加入公司' },
        { status: 400 }
      );
    }

    // 创建行程单
    const [itinerary] = await db
      .insert(tripItineraries)
      .values({
        tenantId,
        userId: session.user.id,
        reimbursementId: reimbursementId || null,
        tripId: tripId || null,
        title,
        purpose: purpose || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        destinations: destinations || [],
        status: itineraryStatus || 'draft',
        aiGenerated: true,
      })
      .returning();

    // 创建行程明细
    if (items && items.length > 0) {
      await db.insert(tripItineraryItems).values(
        items.map((item: any, index: number) => ({
          itineraryId: itinerary.id,
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

    // 如果指定了 reimbursementId，将行程单关联到报销单
    if (reimbursementId) {
      // 验证报销单属于当前用户
      const reimbursement = await db.query.reimbursements.findFirst({
        where: and(
          eq(reimbursements.id, reimbursementId),
          eq(reimbursements.userId, session.user.id)
        ),
      });

      if (!reimbursement) {
        console.warn('Reimbursement not found or not owned by user:', reimbursementId);
      }
    }

    // 返回完整的行程单（含明细）
    const fullItinerary = await db.query.tripItineraries.findFirst({
      where: eq(tripItineraries.id, itinerary.id),
      with: {
        items: true,
      },
    });

    return NextResponse.json({ success: true, data: fullItinerary });
  } catch (error: any) {
    console.error('Create trip itinerary error:', error);
    return NextResponse.json(
      { error: `创建行程单失败: ${error?.message || '未知错误'}` },
      { status: 500 }
    );
  }
}
