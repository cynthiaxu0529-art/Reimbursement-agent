/**
 * Test Tool Call API
 * Simulates what the AI tool executor does to help debug authentication issues
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/ai/test-tool-call
 *
 * Tests the internal authentication mechanism by simulating a tool call
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Get current user session
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 2. Get user details
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '未关联公司' }, { status: 404 });
    }

    // 3. Construct the baseUrl (same logic as chat route)
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXTAUTH_URL || 'http://localhost:3000';

    // 4. Build test API call with internal auth params
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = now;

    const queryParams = new URLSearchParams({
      scope: 'personal',
      period: 'custom',
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      dateFilterType: 'expense_date',
      internalUserId: session.user.id,
      internalTenantId: user.tenantId,
    });

    const apiUrl = `${baseUrl}/api/analytics/tech-expenses?${queryParams}`;

    console.log('[Test Tool Call] Making request:', {
      baseUrl,
      apiUrl,
      userId: session.user.id,
      tenantId: user.tenantId,
      params: Object.fromEntries(queryParams.entries()),
    });

    // 5. Make the fetch call (simulating tool executor)
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const responseData = await response.json();

    // 6. Return detailed results
    return NextResponse.json({
      success: response.ok,
      statusCode: response.status,
      testConfig: {
        baseUrl,
        userId: session.user.id,
        tenantId: user.tenantId,
        userName: user.name,
      },
      requestUrl: apiUrl,
      requestParams: Object.fromEntries(queryParams.entries()),
      response: responseData,
    });
  } catch (error: any) {
    console.error('[Test Tool Call] Error:', error);
    return NextResponse.json({
      error: 'Test failed',
      message: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
