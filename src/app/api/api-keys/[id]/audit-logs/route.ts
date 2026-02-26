/**
 * Agent 审计日志查询接口
 *
 * GET /api/api-keys/:id/audit-logs - 查看某个 API Key 的操作日志
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { apiKeys, agentAuditLogs } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50'), 100);
    const action = searchParams.get('action');

    // 确认 Key 属于当前用户
    const keyRecord = await db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.id, id),
        eq(apiKeys.userId, session.user.id)
      ),
    });

    if (!keyRecord) {
      return NextResponse.json({ error: 'API Key 不存在' }, { status: 404 });
    }

    // 构建查询条件
    const conditions = [eq(agentAuditLogs.apiKeyId, id)];
    if (action) {
      conditions.push(eq(agentAuditLogs.action, action));
    }

    const logs = await db.query.agentAuditLogs.findMany({
      where: and(...conditions),
      orderBy: [desc(agentAuditLogs.createdAt)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return NextResponse.json({
      success: true,
      data: logs,
      meta: { page, pageSize, apiKeyId: id, apiKeyName: keyRecord.name },
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    return NextResponse.json({ error: '获取审计日志失败' }, { status: 500 });
  }
}
