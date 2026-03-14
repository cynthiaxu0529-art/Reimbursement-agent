import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { trips, users, tripItineraries } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { authenticate } from '@/lib/auth/api-key';
import { API_SCOPES } from '@/lib/auth/scopes';

export const dynamic = 'force-dynamic';

/**
 * GET /api/trips - 获取用户的行程列表
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticate(request, API_SCOPES.TRIP_READ);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.statusCode });
    }
    const { userId } = authResult.context;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const conditions: any[] = [eq(trips.userId, userId)];
    if (status) {
      conditions.push(eq(trips.status, status as any));
    }

    const list = await db.query.trips.findMany({
      where: and(...conditions),
      orderBy: [desc(trips.startDate)],
      with: {
        itineraries: {
          with: { items: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    console.error('Get trips error:', error);
    return NextResponse.json(
      { error: `获取行程列表失败: ${error?.message || '未知错误'}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/trips - 创建新行程（事前规划）
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticate(request, API_SCOPES.TRIP_CREATE);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.statusCode });
    }
    const { userId, tenantId } = authResult.context;

    const body = await request.json();
    const { title, purpose, destination, startDate, endDate, budget } = body;

    if (!title || !startDate || !endDate) {
      return NextResponse.json(
        { error: '行程标题、开始日期和结束日期为必填项' },
        { status: 400 }
      );
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

    const [trip] = await db
      .insert(trips)
      .values({
        tenantId: resolvedTenantId,
        userId,
        title,
        purpose: purpose || null,
        destination: destination || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: 'planning',
        budget: budget || null,
      })
      .returning();

    return NextResponse.json({ success: true, data: trip });
  } catch (error: any) {
    console.error('Create trip error:', error);
    return NextResponse.json(
      { error: `创建行程失败: ${error?.message || '未知错误'}` },
      { status: 500 }
    );
  }
}
