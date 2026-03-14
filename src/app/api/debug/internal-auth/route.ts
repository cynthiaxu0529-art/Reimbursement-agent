/**
 * Debug endpoint to test internal authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const internalUserId = searchParams.get('internalUserId');
    const internalTenantId = searchParams.get('internalTenantId');

    // Check session
    const session = await auth();

    // Validate internal auth if params provided
    let internalAuthResult = null;
    if (internalUserId && internalTenantId) {
      const user = await db.query.users.findFirst({
        where: eq(users.id, internalUserId),
      });

      internalAuthResult = {
        userFound: !!user,
        tenantIdMatches: user?.tenantId === internalTenantId,
        userTenantId: user?.tenantId,
        providedTenantId: internalTenantId,
        userName: user?.name,
      };
    }

    return NextResponse.json({
      debug: 'Internal Auth Test',
      requestUrl: request.url,
      allParams: Object.fromEntries(searchParams.entries()),
      params: {
        internalUserId,
        internalTenantId,
        hasInternalUserId: !!internalUserId,
        hasInternalTenantId: !!internalTenantId,
      },
      session: {
        hasSession: !!session,
        userId: session?.user?.id,
      },
      internalAuthResult,
      result: internalUserId && internalTenantId
        ? (internalAuthResult?.userFound && internalAuthResult?.tenantIdMatches
            ? 'Internal auth would succeed'
            : 'Internal auth would fail')
        : 'No internal auth params provided',
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
