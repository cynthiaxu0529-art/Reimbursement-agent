/**
 * API Key 单个管理接口
 *
 * GET    /api/api-keys/:id - 获取 API Key 详情
 * PATCH  /api/api-keys/:id - 更新 API Key（名称、scopes、限制等）
 * DELETE /api/api-keys/:id - 撤销 API Key
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { apiKeys, agentAuditLogs, users } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { validateScopes, filterScopesByRole } from '@/lib/auth/scopes';

export const dynamic = 'force-dynamic';

/**
 * GET /api/api-keys/:id - 获取 API Key 详情（含使用统计）
 */
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

    const keyRecord = await db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.id, id),
        eq(apiKeys.userId, session.user.id)
      ),
    });

    if (!keyRecord) {
      return NextResponse.json({ error: 'API Key 不存在' }, { status: 404 });
    }

    // 获取最近的审计日志
    const recentLogs = await db.query.agentAuditLogs.findMany({
      where: eq(agentAuditLogs.apiKeyId, id),
      orderBy: [desc(agentAuditLogs.createdAt)],
      limit: 20,
      columns: {
        id: true,
        action: true,
        method: true,
        path: true,
        statusCode: true,
        agentType: true,
        entityType: true,
        entityId: true,
        durationMs: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: keyRecord.id,
        name: keyRecord.name,
        keyPrefix: keyRecord.keyPrefix,
        scopes: keyRecord.scopes,
        agentType: keyRecord.agentType,
        agentMetadata: keyRecord.agentMetadata,
        rateLimitPerMinute: keyRecord.rateLimitPerMinute,
        rateLimitPerDay: keyRecord.rateLimitPerDay,
        maxAmountPerRequest: keyRecord.maxAmountPerRequest,
        maxAmountPerDay: keyRecord.maxAmountPerDay,
        isActive: keyRecord.isActive,
        expiresAt: keyRecord.expiresAt,
        lastUsedAt: keyRecord.lastUsedAt,
        usageCount: keyRecord.usageCount,
        revokedAt: keyRecord.revokedAt,
        revokeReason: keyRecord.revokeReason,
        createdAt: keyRecord.createdAt,
        recentActivity: recentLogs,
      },
    });
  } catch (error) {
    console.error('Get API key error:', error);
    return NextResponse.json({ error: '获取 API Key 详情失败' }, { status: 500 });
  }
}

/**
 * PATCH /api/api-keys/:id - 更新 API Key
 *
 * 可更新字段：name, scopes, rateLimitPerMinute, rateLimitPerDay,
 *            maxAmountPerRequest, maxAmountPerDay, isActive
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;

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

    if (keyRecord.revokedAt) {
      return NextResponse.json({ error: '已撤销的 API Key 无法修改' }, { status: 400 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        return NextResponse.json({ error: '名称不能为空' }, { status: 400 });
      }
      updates.name = body.name.trim();
    }

    if (body.scopes !== undefined) {
      if (!Array.isArray(body.scopes) || body.scopes.length === 0) {
        return NextResponse.json({ error: '至少需要一个 scope' }, { status: 400 });
      }
      const validation = validateScopes(body.scopes);
      if (!validation.valid) {
        return NextResponse.json(
          { error: `无效的 scope: ${validation.invalid.join(', ')}` },
          { status: 400 }
        );
      }

      // 验证用户角色是否允许使用这些 scopes
      const currentUser = await db.query.users.findFirst({
        where: eq(users.id, session.user.id),
      });
      const userRoles = currentUser?.roles || [currentUser?.role || 'employee'];
      const { denied } = filterScopesByRole(body.scopes, userRoles);
      if (denied.length > 0) {
        return NextResponse.json(
          { error: `您的角色不允许使用以下权限: ${denied.join(', ')}` },
          { status: 403 }
        );
      }

      updates.scopes = body.scopes;
    }

    if (body.rateLimitPerMinute !== undefined) {
      updates.rateLimitPerMinute = Math.max(1, Math.min(1000, body.rateLimitPerMinute));
    }
    if (body.rateLimitPerDay !== undefined) {
      updates.rateLimitPerDay = Math.max(1, Math.min(100000, body.rateLimitPerDay));
    }
    if (body.maxAmountPerRequest !== undefined) {
      updates.maxAmountPerRequest = body.maxAmountPerRequest > 0 ? body.maxAmountPerRequest : null;
    }
    if (body.maxAmountPerDay !== undefined) {
      updates.maxAmountPerDay = body.maxAmountPerDay > 0 ? body.maxAmountPerDay : null;
    }
    if (body.isActive !== undefined) {
      updates.isActive = !!body.isActive;
    }

    const [updated] = await db.update(apiKeys)
      .set(updates)
      .where(eq(apiKeys.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        scopes: updated.scopes,
        rateLimitPerMinute: updated.rateLimitPerMinute,
        rateLimitPerDay: updated.rateLimitPerDay,
        maxAmountPerRequest: updated.maxAmountPerRequest,
        maxAmountPerDay: updated.maxAmountPerDay,
        isActive: updated.isActive,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error('Update API key error:', error);
    return NextResponse.json({ error: '更新 API Key 失败' }, { status: 500 });
  }
}

/**
 * DELETE /api/api-keys/:id - 撤销 API Key
 *
 * 请求体（可选）:
 * { reason?: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;

    const keyRecord = await db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.id, id),
        eq(apiKeys.userId, session.user.id)
      ),
    });

    if (!keyRecord) {
      return NextResponse.json({ error: 'API Key 不存在' }, { status: 404 });
    }

    if (keyRecord.revokedAt) {
      return NextResponse.json({ error: 'API Key 已经被撤销' }, { status: 400 });
    }

    let reason: string | undefined;
    try {
      const body = await request.json();
      reason = body.reason;
    } catch {
      // DELETE 可以没有 body
    }

    await db.update(apiKeys)
      .set({
        isActive: false,
        revokedAt: new Date(),
        revokedBy: session.user.id,
        revokeReason: reason || null,
        updatedAt: new Date(),
      })
      .where(eq(apiKeys.id, id));

    return NextResponse.json({
      success: true,
      message: 'API Key 已撤销',
    });
  } catch (error) {
    console.error('Revoke API key error:', error);
    return NextResponse.json({ error: '撤销 API Key 失败' }, { status: 500 });
  }
}
