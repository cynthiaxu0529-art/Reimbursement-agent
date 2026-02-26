/**
 * 管理员全局 Agent 审计日志查询接口
 *
 * GET /api/admin/agent-audit-logs - 查看租户内所有 Agent 操作日志
 *
 * 只有 Admin / Super Admin 可以访问。
 * 支持按时间范围、Agent 类型、操作类型、用户筛选。
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { agentAuditLogs, apiKeys, users } from '@/lib/db/schema';
import { eq, and, desc, gte, lte, sql, count } from 'drizzle-orm';
import { getUserRoles, isAdmin } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 权限检查：只有 Admin / Super Admin 可以查看全局审计日志
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!currentUser) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    const userRoles = getUserRoles(currentUser);
    if (!isAdmin(userRoles)) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    if (!currentUser.tenantId) {
      return NextResponse.json({ error: '用户未关联租户' }, { status: 400 });
    }

    // 解析查询参数
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50')));
    const agentType = searchParams.get('agentType');
    const action = searchParams.get('action');
    const userId = searchParams.get('userId');
    const apiKeyId = searchParams.get('apiKeyId');
    const startDate = searchParams.get('startDate');   // ISO 格式：2026-02-01
    const endDate = searchParams.get('endDate');       // ISO 格式：2026-02-28
    const entityType = searchParams.get('entityType');

    // 构建过滤条件
    const conditions = [
      eq(agentAuditLogs.tenantId, currentUser.tenantId),
    ];

    if (agentType) {
      conditions.push(eq(agentAuditLogs.agentType, agentType));
    }
    if (action) {
      conditions.push(eq(agentAuditLogs.action, action));
    }
    if (userId) {
      conditions.push(eq(agentAuditLogs.userId, userId));
    }
    if (apiKeyId) {
      conditions.push(eq(agentAuditLogs.apiKeyId, apiKeyId));
    }
    if (entityType) {
      conditions.push(eq(agentAuditLogs.entityType, entityType));
    }
    if (startDate) {
      conditions.push(gte(agentAuditLogs.createdAt, new Date(startDate)));
    }
    if (endDate) {
      // endDate 包含当天（加到当天 23:59:59）
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(agentAuditLogs.createdAt, end));
    }

    const whereClause = and(...conditions);

    // 查询日志列表（带关联信息）
    const logs = await db
      .select({
        id: agentAuditLogs.id,
        action: agentAuditLogs.action,
        method: agentAuditLogs.method,
        path: agentAuditLogs.path,
        statusCode: agentAuditLogs.statusCode,
        agentType: agentAuditLogs.agentType,
        agentVersion: agentAuditLogs.agentVersion,
        requestSummary: agentAuditLogs.requestSummary,
        responseSummary: agentAuditLogs.responseSummary,
        entityType: agentAuditLogs.entityType,
        entityId: agentAuditLogs.entityId,
        ipAddress: agentAuditLogs.ipAddress,
        durationMs: agentAuditLogs.durationMs,
        createdAt: agentAuditLogs.createdAt,
        // 关联的用户信息
        userName: users.name,
        userEmail: users.email,
        // 关联的 API Key 信息
        apiKeyName: apiKeys.name,
        apiKeyPrefix: apiKeys.keyPrefix,
      })
      .from(agentAuditLogs)
      .leftJoin(users, eq(agentAuditLogs.userId, users.id))
      .leftJoin(apiKeys, eq(agentAuditLogs.apiKeyId, apiKeys.id))
      .where(whereClause)
      .orderBy(desc(agentAuditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // 查询总数
    const [totalResult] = await db
      .select({ total: count() })
      .from(agentAuditLogs)
      .where(whereClause);

    const total = totalResult?.total || 0;

    // 统计摘要（同租户内的全局统计）
    const summaryConditions = [
      eq(agentAuditLogs.tenantId, currentUser.tenantId),
    ];
    // 时间范围也应用到摘要
    if (startDate) {
      summaryConditions.push(gte(agentAuditLogs.createdAt, new Date(startDate)));
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      summaryConditions.push(lte(agentAuditLogs.createdAt, end));
    }

    const summaryWhereClause = and(...summaryConditions);

    // 按操作类型统计
    const actionStats = await db
      .select({
        action: agentAuditLogs.action,
        count: count(),
      })
      .from(agentAuditLogs)
      .where(summaryWhereClause)
      .groupBy(agentAuditLogs.action)
      .orderBy(desc(count()));

    // 按 Agent 类型统计
    const agentStats = await db
      .select({
        agentType: agentAuditLogs.agentType,
        count: count(),
      })
      .from(agentAuditLogs)
      .where(summaryWhereClause)
      .groupBy(agentAuditLogs.agentType)
      .orderBy(desc(count()));

    // 按用户统计
    const userStats = await db
      .select({
        userId: agentAuditLogs.userId,
        userName: users.name,
        count: count(),
      })
      .from(agentAuditLogs)
      .leftJoin(users, eq(agentAuditLogs.userId, users.id))
      .where(summaryWhereClause)
      .groupBy(agentAuditLogs.userId, users.name)
      .orderBy(desc(count()))
      .limit(20);

    return NextResponse.json({
      success: true,
      data: logs,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: {
        totalLogs: total,
        byAction: actionStats,
        byAgentType: agentStats,
        byUser: userStats,
      },
    });
  } catch (error) {
    console.error('Admin agent audit logs error:', error);
    return NextResponse.json({ error: '获取审计日志失败' }, { status: 500 });
  }
}
