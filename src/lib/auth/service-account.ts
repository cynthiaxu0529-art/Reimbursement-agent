/**
 * Service Account 认证模块
 *
 * 用于系统间（M2M）认证，如 Accounting Agent ↔ Reimbursement Agent。
 *
 * 认证流程：
 * 1. 从请求头 X-Service-Key 提取 API Key
 * 2. 遍历 service_accounts 表，用 bcrypt 比对 hash
 * 3. 校验：是否激活、是否撤销
 * 4. 检查 permissions 是否包含所需权限
 * 5. 返回认证上下文
 */

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { serviceAccounts } from '@/lib/db/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

// ============================================================================
// 类型定义
// ============================================================================

export interface ServiceAccountAuthContext {
  authType: 'service_account';
  serviceAccountId: string;
  serviceName: string;
  permissions: string[];
}

export interface ServiceAccountAuthError {
  error: string;
  code: string;
  statusCode: number;
}

export type ServiceAccountAuthResult =
  | { success: true; context: ServiceAccountAuthContext }
  | { success: false; error: ServiceAccountAuthError };

// ============================================================================
// 常量
// ============================================================================

const SERVICE_KEY_HEADER = 'x-service-key';
const SERVICE_KEY_PREFIX = 'sk_svc_';

// ============================================================================
// 核心函数
// ============================================================================

/**
 * 生成新的 Service Account API Key
 */
export async function generateServiceAccountKey(): Promise<{
  key: string;
  keyHash: string;
  keyPrefix: string;
}> {
  const { randomBytes } = await import('crypto');
  const randomPart = randomBytes(32).toString('hex');
  const key = `${SERVICE_KEY_PREFIX}${randomPart}`;
  const keyHash = await bcrypt.hash(key, 12);
  const keyPrefix = key.substring(0, 14) + '...';

  return { key, keyHash, keyPrefix };
}

/**
 * 从请求头中提取 Service Key
 */
function extractServiceKey(request: NextRequest): string | null {
  return request.headers.get(SERVICE_KEY_HEADER) || null;
}

/**
 * 判断请求是否携带 Service Key
 */
export function isServiceKeyRequest(request: NextRequest): boolean {
  const key = request.headers.get(SERVICE_KEY_HEADER);
  return !!key && key.startsWith(SERVICE_KEY_PREFIX);
}

/**
 * 验证 Service Account 并返回认证上下文
 */
export async function authenticateServiceAccount(
  request: NextRequest,
  requiredPermission?: string
): Promise<ServiceAccountAuthResult> {
  // 1. 提取 key
  const rawKey = extractServiceKey(request);
  if (!rawKey) {
    return {
      success: false,
      error: {
        error: 'Missing X-Service-Key header',
        code: 'MISSING_SERVICE_KEY',
        statusCode: 401,
      },
    };
  }

  // 2. 查找所有活跃的 service accounts
  const activeAccounts = await db
    .select()
    .from(serviceAccounts)
    .where(
      and(
        eq(serviceAccounts.isActive, true),
        isNull(serviceAccounts.revokedAt)
      )
    );

  // 3. 用 bcrypt 比对找到匹配的 account
  let matchedAccount = null;
  for (const account of activeAccounts) {
    const isMatch = await bcrypt.compare(rawKey, account.apiKeyHash);
    if (isMatch) {
      matchedAccount = account;
      break;
    }
  }

  if (!matchedAccount) {
    return {
      success: false,
      error: {
        error: 'Invalid service key',
        code: 'INVALID_SERVICE_KEY',
        statusCode: 401,
      },
    };
  }

  // 4. 检查权限
  const permissions = (matchedAccount.permissions as string[]) || [];
  if (requiredPermission && !permissions.includes(requiredPermission)) {
    return {
      success: false,
      error: {
        error: `Insufficient permission. Required: ${requiredPermission}`,
        code: 'INSUFFICIENT_PERMISSION',
        statusCode: 403,
      },
    };
  }

  // 5. 更新使用统计（异步，不阻塞）
  db.update(serviceAccounts)
    .set({
      lastUsedAt: new Date(),
      usageCount: sql`${serviceAccounts.usageCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(serviceAccounts.id, matchedAccount.id))
    .catch((err: unknown) => console.error('Failed to update service account usage:', err));

  return {
    success: true,
    context: {
      authType: 'service_account',
      serviceAccountId: matchedAccount.id,
      serviceName: matchedAccount.serviceName,
      permissions,
    },
  };
}
