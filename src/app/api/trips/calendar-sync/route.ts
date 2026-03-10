import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { accounts, trips, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

/**
 * POST /api/trips/calendar-sync
 * 从 Google Calendar 扫描差旅相关事件，自动创建行程计划
 *
 * 前提：用户通过 Google OAuth 登录，且授权了 calendar.readonly scope
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // 获取用户的 Google OAuth token
    const account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.userId, session.user.id),
        eq(accounts.provider, 'google')
      ),
    });

    if (!account?.access_token) {
      return NextResponse.json({
        error: '未关联 Google 账号，请使用 Google 登录或在设置中关联',
        code: 'NO_GOOGLE_ACCOUNT',
      }, { status: 400 });
    }

    // 获取用户 tenantId
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { tenantId: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '请先加入公司' }, { status: 400 });
    }

    // 设置 Google API 认证
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token,
    });

    // 如果 token 过期，尝试刷新
    if (account.expires_at && account.expires_at * 1000 < Date.now()) {
      if (!account.refresh_token) {
        return NextResponse.json({
          error: 'Google 授权已过期，请重新使用 Google 登录',
          code: 'TOKEN_EXPIRED',
        }, { status: 401 });
      }
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        // 更新数据库中的 token
        await db.update(accounts)
          .set({
            access_token: credentials.access_token,
            expires_at: credentials.expiry_date ? Math.floor(credentials.expiry_date / 1000) : null,
          })
          .where(eq(accounts.id, account.id));
        oauth2Client.setCredentials(credentials);
      } catch {
        return NextResponse.json({
          error: 'Google 授权刷新失败，请重新登录',
          code: 'REFRESH_FAILED',
        }, { status: 401 });
      }
    }

    // 查询未来 30 天的日历事件
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const eventsResponse = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: thirtyDaysLater.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    });

    const events = eventsResponse.data.items || [];

    // 用关键词匹配差旅相关事件
    const travelKeywords = [
      // 中文
      '出差', '差旅', '商务旅行', '拜访客户', '外出', '会议出行',
      // 英文
      'business trip', 'travel', 'flight', 'hotel', 'conference',
      'client visit', 'on-site', 'offsite',
    ];

    const travelEvents = events.filter(event => {
      const text = `${event.summary || ''} ${event.description || ''} ${event.location || ''}`.toLowerCase();
      return travelKeywords.some(kw => text.includes(kw.toLowerCase()));
    });

    if (travelEvents.length === 0) {
      return NextResponse.json({
        success: true,
        data: { created: 0, events: [] },
        message: '未来 30 天内未找到差旅相关的日历事件',
      });
    }

    // 获取已有的行程（避免重复创建）
    const existingTrips = await db.query.trips.findMany({
      where: eq(trips.userId, session.user.id),
      columns: { calendarEventIds: true },
    });
    const existingEventIds = new Set(
      existingTrips.flatMap(t => (t.calendarEventIds as string[]) || [])
    );

    // 为每个差旅事件创建行程
    const createdTrips: any[] = [];
    for (const event of travelEvents) {
      if (!event.id || existingEventIds.has(event.id)) continue;

      const startDate = event.start?.dateTime || event.start?.date;
      const endDate = event.end?.dateTime || event.end?.date;
      if (!startDate || !endDate) continue;

      const [trip] = await db.insert(trips).values({
        tenantId: user.tenantId,
        userId: session.user.id,
        title: event.summary || '日历行程',
        purpose: event.description?.slice(0, 200) || undefined,
        destination: event.location || undefined,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: 'planning',
        calendarEventIds: [event.id],
      }).returning();

      createdTrips.push(trip);
    }

    return NextResponse.json({
      success: true,
      data: {
        scanned: events.length,
        travelEvents: travelEvents.length,
        created: createdTrips.length,
        trips: createdTrips,
      },
    });
  } catch (error: any) {
    console.error('Calendar sync error:', error);
    return NextResponse.json(
      { error: `日历同步失败: ${error?.message || '未知错误'}` },
      { status: 500 }
    );
  }
}
