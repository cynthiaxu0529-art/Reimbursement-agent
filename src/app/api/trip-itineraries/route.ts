import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tripItineraries, tripItineraryItems, reimbursements, users } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { authenticate } from '@/lib/auth/api-key';
import { API_SCOPES } from '@/lib/auth/scopes';

export const dynamic = 'force-dynamic';

/**
 * GET /api/trip-itineraries - 获取用户的行程单列表
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticate(request, API_SCOPES.TRIP_READ);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.statusCode });
    }
    const { userId } = authResult.context;

    const { searchParams } = new URL(request.url);
    const reimbursementId = searchParams.get('reimbursementId');
    const tripId = searchParams.get('tripId');

    const conditions: any[] = [eq(tripItineraries.userId, userId)];

    if (reimbursementId) {
      conditions.push(eq(tripItineraries.reimbursementId, reimbursementId));
    }
    if (tripId) {
      conditions.push(eq(tripItineraries.tripId, tripId));
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
    const authResult = await authenticate(request, API_SCOPES.TRIP_CREATE);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.statusCode });
    }
    const { userId, tenantId } = authResult.context;

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

    // 如果 authenticate 已返回 tenantId 则直接用；否则查数据库
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId) {
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { tenantId: true },
      });
      resolvedTenantId = user?.tenantId || undefined;
    }

    if (!resolvedTenantId) {
      return NextResponse.json(
        { error: '请先在设置中创建或加入公司' },
        { status: 400 }
      );
    }

    // 创建行程单
    const [itinerary] = await db
      .insert(tripItineraries)
      .values({
        tenantId: resolvedTenantId,
        userId,
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

    // 如果指定了 reimbursementId，验证报销单属于当前用户
    if (reimbursementId) {
      const reimbursement = await db.query.reimbursements.findFirst({
        where: and(
          eq(reimbursements.id, reimbursementId),
          eq(reimbursements.userId, userId)
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
