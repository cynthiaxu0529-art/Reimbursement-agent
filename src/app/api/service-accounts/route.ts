/**
 * Service Account 管理接口
 *
 * GET  /api/service-accounts  - 列出所有 service accounts（不含 key）
 * POST /api/service-accounts  - 创建新 service account（返回明文 key，仅一次）
 *
 * 需要管理员权限（Session 登录）
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { serviceAccounts, users } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { generateServiceAccountKey } from '@/lib/auth/service-account';
import { getUserRoles, isAdmin } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/**
 * GET /api/service-accounts - 列出所有 service accounts
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 检查管理员权限
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });
    if (!currentUser || !isAdmin(getUserRoles(currentUser))) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const accounts = await db
      .select({
        id: serviceAccounts.id,
        serviceName: serviceAccounts.serviceName,
        description: serviceAccounts.description,
        keyPrefix: serviceAccounts.keyPrefix,
        permissions: serviceAccounts.permissions,
        isActive: serviceAccounts.isActive,
        lastUsedAt: serviceAccounts.lastUsedAt,
        usageCount: serviceAccounts.usageCount,
        revokedAt: serviceAccounts.revokedAt,
        createdAt: serviceAccounts.createdAt,
      })
      .from(serviceAccounts)
      .orderBy(desc(serviceAccounts.createdAt));

    return NextResponse.json({ success: true, data: accounts });
  } catch (error) {
    console.error('List service accounts error:', error);
    return NextResponse.json({ error: '获取 Service Account 列表失败' }, { status: 500 });
  }
}

/**
 * POST /api/service-accounts - 创建新 service account
 *
 * 请求体:
 * {
 *   service_name: string;       // 服务名称（唯一）
 *   description?: string;       // 描述
 *   permissions: string[];      // 权限列表
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 检查管理员权限
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });
    if (!currentUser || !isAdmin(getUserRoles(currentUser))) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const body = await request.json();
    const { service_name, description, permissions } = body;

    if (!service_name || typeof service_name !== 'string' || service_name.trim().length === 0) {
      return NextResponse.json({ error: '请提供 service_name' }, { status: 400 });
    }

    if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
      return NextResponse.json({ error: '请至少提供一个 permission' }, { status: 400 });
    }

    // 检查是否已存在同名 service account
    const existing = await db.query.serviceAccounts.findFirst({
      where: eq(serviceAccounts.serviceName, service_name.trim()),
    });
    if (existing) {
      return NextResponse.json(
        { error: `Service account "${service_name}" 已存在` },
        { status: 409 }
      );
    }

    // 生成 key
    const { key, keyHash, keyPrefix } = await generateServiceAccountKey();

    // 创建记录
    const [created] = await db.insert(serviceAccounts).values({
      serviceName: service_name.trim(),
      description: description || null,
      apiKeyHash: keyHash,
      keyPrefix,
      permissions,
    }).returning();

    return NextResponse.json({
      success: true,
      data: {
        id: created.id,
        service_name: created.serviceName,
        // 明文 key 只返回一次
        api_key: key,
        key_prefix: created.keyPrefix,
        permissions: created.permissions,
        created_at: created.createdAt,
      },
      warning: '请安全保存此 API Key，它不会再次显示。',
    });
  } catch (error) {
    console.error('Create service account error:', error);
    return NextResponse.json({ error: '创建 Service Account 失败' }, { status: 500 });
  }
}
