import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { invitations, users } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/invites?email=xxx - 查询邀请和用户状态（临时调试用）
 */
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email');

  if (!email) {
    return NextResponse.json({ error: 'Missing email parameter' }, { status: 400 });
  }

  // 查询邀请记录
  const inviteRecords = await db.query.invitations.findMany({
    where: sql`${invitations.email} ILIKE ${'%' + email + '%'}`,
  });

  // 查询用户记录
  const userRecords = await db.query.users.findMany({
    where: sql`${users.email} ILIKE ${'%' + email + '%'}`,
  });

  const now = new Date();

  return NextResponse.json({
    query: email,
    timestamp: now.toISOString(),
    invitations: inviteRecords.map(inv => ({
      id: inv.id,
      email: inv.email,
      name: inv.name,
      status: inv.status,
      expiresAt: inv.expiresAt,
      isExpired: inv.expiresAt < now,
      createdAt: inv.createdAt,
      roles: inv.roles,
      departmentId: inv.departmentId,
    })),
    users: userRecords.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      tenantId: u.tenantId,
      createdAt: u.createdAt,
    })),
  });
}
