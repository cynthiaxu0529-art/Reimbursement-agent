/**
 * 自动审批决策日志查询
 * GET /api/auto-approval/logs?limit=20&offset=0&decision=queued
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { autoApprovalLogs, reimbursements, users } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100);
  const offset = parseInt(searchParams.get('offset') ?? '0');
  const decision = searchParams.get('decision'); // queued | executed | skipped | cancelled

  const conditions = [
    eq(autoApprovalLogs.approverId, session.user.id),
  ];

  if (decision) {
    conditions.push(eq(autoApprovalLogs.decision, decision));
  }

  const logs = await db
    .select({
      log: autoApprovalLogs,
      reimbursementTitle: reimbursements.title,
      reimbursementStatus: reimbursements.status,
      submitterName: users.name,
    })
    .from(autoApprovalLogs)
    .innerJoin(reimbursements, eq(autoApprovalLogs.reimbursementId, reimbursements.id))
    .innerJoin(users, eq(reimbursements.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(autoApprovalLogs.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ logs });
}
