import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { trips, users, tripItineraries } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/trips - 获取用户的行程列表
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const conditions: any[] = [eq(trips.userId, session.user.id)];
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const { title, purpose, destination, startDate, endDate, budget } = body;

    if (!title || !startDate || !endDate) {
      return NextResponse.json(
        { error: '行程标题、开始日期和结束日期为必填项' },
        { status: 400 }
      );
    }

    // 获取用户的 tenantId
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json(
        { error: '请先在设置中创建或加入公司' },
        { status: 400 }
      );
    }

    const [trip] = await db
      .insert(trips)
      .values({
        tenantId: user.tenantId,
        userId: session.user.id,
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
