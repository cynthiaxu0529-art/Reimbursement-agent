/**
 * API Key 管理接口
 *
 * GET  /api/api-keys     - 列出当前用户的 API Keys
 * POST /api/api-keys     - 创建新的 API Key
 *
 * 只有通过 Session 登录的用户可以管理 API Keys（不允许用 API Key 创建 API Key）
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { apiKeys, users } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { generateApiKey, hashApiKey } from '@/lib/auth/api-key';
import { validateScopes, SCOPE_PRESETS, getScopesByCategory } from '@/lib/auth/scopes';

export const dynamic = 'force-dynamic';

/**
 * GET /api/api-keys - 列出用户的 API Keys
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });
    if (!currentUser?.tenantId) {
      return NextResponse.json({ error: '用户未关联租户' }, { status: 400 });
    }

    const keys = await db.query.apiKeys.findMany({
      where: and(
        eq(apiKeys.userId, session.user.id),
        eq(apiKeys.tenantId, currentUser.tenantId)
      ),
      orderBy: [desc(apiKeys.createdAt)],
      columns: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        agentType: true,
        rateLimitPerMinute: true,
        rateLimitPerDay: true,
        maxAmountPerRequest: true,
        maxAmountPerDay: true,
        isActive: true,
        expiresAt: true,
        lastUsedAt: true,
        usageCount: true,
        revokedAt: true,
        createdAt: true,
      },
    });

    // 也返回可用的 scope 信息，方便前端 / Agent 展示
    const scopeCategories = getScopesByCategory();

    return NextResponse.json({
      success: true,
      data: keys,
      meta: {
        scopePresets: SCOPE_PRESETS,
        scopeCategories,
      },
    });
  } catch (error) {
    console.error('List API keys error:', error);
    return NextResponse.json({ error: '获取 API Key 列表失败' }, { status: 500 });
  }
}

/**
 * POST /api/api-keys - 创建新的 API Key
 *
 * 请求体:
 * {
 *   name: string;                    // Key 名称
 *   scopes: string[];                // 权限范围
 *   agentType?: string;              // Agent 类型
 *   expiresInDays?: number;          // 过期天数（可选）
 *   rateLimitPerMinute?: number;     // 每分钟限制（默认 60）
 *   rateLimitPerDay?: number;        // 每日限制（默认 1000）
 *   maxAmountPerRequest?: number;    // 单次金额上限
 *   maxAmountPerDay?: number;        // 每日金额上限
 * }
 *
 * 注意：明文 key 只在创建时返回一次，之后无法再获取
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });
    if (!currentUser?.tenantId) {
      return NextResponse.json({ error: '用户未关联租户' }, { status: 400 });
    }

    const body = await request.json();
    const {
      name,
      scopes,
      agentType,
      expiresInDays,
      rateLimitPerMinute = 60,
      rateLimitPerDay = 1000,
      maxAmountPerRequest,
      maxAmountPerDay,
    } = body;

    // 验证必填字段
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: '请提供 API Key 名称' }, { status: 400 });
    }

    if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
      return NextResponse.json({ error: '请至少选择一个权限范围（scope）' }, { status: 400 });
    }

    // 验证 scopes 合法性
    const scopeValidation = validateScopes(scopes);
    if (!scopeValidation.valid) {
      return NextResponse.json(
        { error: `无效的 scope: ${scopeValidation.invalid.join(', ')}` },
        { status: 400 }
      );
    }

    // 检查用户的 API Key 数量限制（每用户最多 10 个有效 Key）
    const existingKeys = await db.query.apiKeys.findMany({
      where: and(
        eq(apiKeys.userId, session.user.id),
        eq(apiKeys.isActive, true)
      ),
    });
    if (existingKeys.length >= 10) {
      return NextResponse.json(
        { error: '每个用户最多创建 10 个有效 API Key，请先撤销不需要的 Key' },
        { status: 400 }
      );
    }

    // 生成 API Key
    const { key, keyHash, keyPrefix } = generateApiKey();

    // 计算过期时间
    let expiresAt: Date | undefined;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    // 创建记录
    const [created] = await db.insert(apiKeys).values({
      tenantId: currentUser.tenantId,
      userId: session.user.id,
      name: name.trim(),
      keyPrefix,
      keyHash,
      scopes,
      agentType: agentType || null,
      rateLimitPerMinute,
      rateLimitPerDay,
      maxAmountPerRequest: maxAmountPerRequest || null,
      maxAmountPerDay: maxAmountPerDay || null,
      expiresAt: expiresAt || null,
    }).returning();

    return NextResponse.json({
      success: true,
      data: {
        id: created.id,
        name: created.name,
        // 明文 Key 只在创建时返回一次！
        key,
        keyPrefix: created.keyPrefix,
        scopes: created.scopes,
        agentType: created.agentType,
        expiresAt: created.expiresAt,
        createdAt: created.createdAt,
      },
      warning: '请安全保存此 API Key，它不会再次显示。',
    });
  } catch (error) {
    console.error('Create API key error:', error);
    return NextResponse.json({ error: '创建 API Key 失败' }, { status: 500 });
  }
}
