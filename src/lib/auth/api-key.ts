/**
 * API Key 认证模块
 *
 * 提供 M2M（Machine-to-Machine）认证能力，
 * 让外部 AI Agent（如 OpenClaw）可以代表用户调用 API。
 *
 * 认证流程：
 * 1. 从请求头 Authorization: Bearer rk_xxx 提取 API Key
 * 2. 计算 SHA-256 哈希，在数据库中查找匹配的 key
 * 3. 校验：是否激活、是否过期、是否撤销
 * 4. 校验 scope 是否覆盖当前请求的操作
 * 5. 校验速率限制
 * 6. 返回认证上下文（用户信息 + agent 元数据）
 */

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiKeys, agentAuditLogs, users } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import { jwtVerify } from 'jose';
import { hasScope, getRequiredScope, checkScopeRoleRequirement, type ApiScope } from './scopes';
import { getUserRoles } from './roles';
import { checkRateLimit } from '@/lib/rate-limit';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * API Key 认证后的上下文信息
 */
export interface ApiKeyAuthContext {
  /** 认证类型 */
  authType: 'api_key';
  /** API Key 记录 ID */
  apiKeyId: string;
  /** 绑定的用户 ID */
  userId: string;
  /** 租户 ID */
  tenantId: string;
  /** 用户信息 */
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    roles: string[];
    tenantId: string;
    departmentId?: string;
    managerId?: string;
  };
  /** 授权的 scopes */
  scopes: string[];
  /** Agent 类型（如 openclaw） */
  agentType?: string;
  /** Agent 元数据 */
  agentMetadata?: Record<string, unknown>;
  /** 金额限制 */
  limits: {
    maxAmountPerRequest?: number;
    maxAmountPerDay?: number;
  };
}

/**
 * 统一的认证上下文（兼容 Session 和 API Key）
 */
export interface AuthContext {
  authType: 'session' | 'api_key';
  userId: string;
  tenantId?: string;
  user: {
    id: string;
    email: string;
    name: string;
    role?: string;
    roles?: string[];
    tenantId?: string;
  };
  /** 仅 API Key 认证时存在 */
  apiKey?: {
    id: string;
    scopes: string[];
    agentType?: string;
    limits: {
      maxAmountPerRequest?: number;
      maxAmountPerDay?: number;
    };
  };
  /** 速率限制信息（仅 API Key 认证时存在），用于向响应注入 header */
  rateLimit?: {
    limit: number;
    remaining: number;
    resetAt: number;
  };
}

export interface ApiKeyAuthError {
  error: string;
  code: string;
  statusCode: number;
}

export type ApiKeyAuthResult =
  | { success: true; context: ApiKeyAuthContext }
  | { success: false; error: ApiKeyAuthError };

// ============================================================================
// 常量
// ============================================================================

/** API Key 前缀 */
const API_KEY_PREFIX = 'rk_';

/** API Key 总长度（前缀 + 随机部分） */
const API_KEY_RANDOM_BYTES = 32;

/** 展示用前缀长度 */
const KEY_PREFIX_DISPLAY_LENGTH = 10;

// ============================================================================
// 核心函数
// ============================================================================

/**
 * 生成新的 API Key
 * @returns { key: 明文 key（只返回一次）, keyHash: 存储用哈希, keyPrefix: 展示用前缀 }
 */
export function generateApiKey(): {
  key: string;
  keyHash: string;
  keyPrefix: string;
} {
  const randomPart = randomBytes(API_KEY_RANDOM_BYTES).toString('hex');
  const key = `${API_KEY_PREFIX}${randomPart}`;
  const keyHash = hashApiKey(key);
  const keyPrefix = key.substring(0, KEY_PREFIX_DISPLAY_LENGTH) + '...';

  return { key, keyHash, keyPrefix };
}

/**
 * 计算 API Key 的 SHA-256 哈希
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * 从请求头中提取 API Key
 */
function extractApiKey(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  // 支持 Bearer token 格式
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;

  const token = parts[1];
  // 只处理以 rk_ 开头的 token，其他格式交给 NextAuth 处理
  if (!token.startsWith(API_KEY_PREFIX)) return null;

  return token;
}

/**
 * 验证 API Key 并返回认证上下文
 *
 * 完整校验流程：
 * 1. 提取并哈希 key
 * 2. 数据库查询
 * 3. 状态校验（激活、未过期、未撤销）
 * 4. Scope 校验
 * 5. 用户角色校验
 * 6. 更新使用统计
 */
export async function authenticateApiKey(
  request: NextRequest,
  requiredScope?: ApiScope
): Promise<ApiKeyAuthResult> {
  // 1. 提取 key
  const rawKey = extractApiKey(request);
  if (!rawKey) {
    return {
      success: false,
      error: {
        error: 'Missing or invalid API key',
        code: 'INVALID_API_KEY',
        statusCode: 401,
      },
    };
  }

  // 2. 查找 key
  const keyHash = hashApiKey(rawKey);
  const keyRecord = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.keyHash, keyHash),
  });

  if (!keyRecord) {
    return {
      success: false,
      error: {
        error: 'Invalid API key',
        code: 'INVALID_API_KEY',
        statusCode: 401,
      },
    };
  }

  // 3. 状态校验
  if (!keyRecord.isActive) {
    return {
      success: false,
      error: {
        error: 'API key is disabled',
        code: 'API_KEY_DISABLED',
        statusCode: 401,
      },
    };
  }

  if (keyRecord.revokedAt) {
    return {
      success: false,
      error: {
        error: 'API key has been revoked',
        code: 'API_KEY_REVOKED',
        statusCode: 401,
      },
    };
  }

  if (keyRecord.expiresAt && new Date() > keyRecord.expiresAt) {
    return {
      success: false,
      error: {
        error: 'API key has expired',
        code: 'API_KEY_EXPIRED',
        statusCode: 401,
      },
    };
  }

  // 4. Scope 校验
  const scopes = (keyRecord.scopes as string[]) || [];

  // 自动从路径推断 scope 或使用显式指定的
  const scopeToCheck = requiredScope ||
    getRequiredScope(new URL(request.url).pathname, request.method);

  if (scopeToCheck && !hasScope(scopes, scopeToCheck)) {
    return {
      success: false,
      error: {
        error: `Insufficient scope. Required: ${scopeToCheck}`,
        code: 'INSUFFICIENT_SCOPE',
        statusCode: 403,
      },
    };
  }

  // 5. 查找绑定的用户
  const user = await db.query.users.findFirst({
    where: eq(users.id, keyRecord.userId),
  });

  if (!user) {
    return {
      success: false,
      error: {
        error: 'API key bound user not found',
        code: 'USER_NOT_FOUND',
        statusCode: 401,
      },
    };
  }

  // 6. 角色校验（scope 可能要求特定角色）
  const userRoles = getUserRoles(user);
  if (scopeToCheck && !checkScopeRoleRequirement(scopeToCheck, userRoles)) {
    return {
      success: false,
      error: {
        error: `User role insufficient for scope: ${scopeToCheck}`,
        code: 'ROLE_INSUFFICIENT',
        statusCode: 403,
      },
    };
  }

  // 7. 更新使用统计（异步，不阻塞响应）
  db.update(apiKeys)
    .set({
      lastUsedAt: new Date(),
      usageCount: sql`${apiKeys.usageCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(apiKeys.id, keyRecord.id))
    .catch((err: unknown) => console.error('Failed to update API key usage:', err));

  return {
    success: true,
    context: {
      authType: 'api_key',
      apiKeyId: keyRecord.id,
      userId: user.id,
      tenantId: keyRecord.tenantId,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        roles: userRoles,
        tenantId: keyRecord.tenantId,
        departmentId: user.departmentId || undefined,
        managerId: user.managerId || undefined,
      },
      scopes,
      agentType: keyRecord.agentType || undefined,
      agentMetadata: (keyRecord.agentMetadata as Record<string, unknown>) || undefined,
      limits: {
        maxAmountPerRequest: keyRecord.maxAmountPerRequest || undefined,
        maxAmountPerDay: keyRecord.maxAmountPerDay || undefined,
      },
    },
  };
}

/**
 * 判断请求是否携带 API Key（用于路由中快速判断认证方式）
 */
export function isApiKeyRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;
  const parts = authHeader.split(' ');
  return parts.length === 2 &&
    parts[0].toLowerCase() === 'bearer' &&
    parts[1].startsWith(API_KEY_PREFIX);
}

/**
 * 判断请求是否携带 JWT bearer token（由 /api/auth/api-token 签发）
 */
function isJwtBearerRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;
  const parts = authHeader.split(' ');
  return parts.length === 2 &&
    parts[0].toLowerCase() === 'bearer' &&
    !parts[1].startsWith(API_KEY_PREFIX); // 非 rk_ 开头的 bearer token
}

/**
 * 从 JWT bearer token 验证并返回 AuthContext
 */
async function authenticateJwtBearer(
  request: NextRequest
): Promise<
  | { success: true; context: AuthContext }
  | { success: false; error: string; statusCode: number }
> {
  const authHeader = request.headers.get('authorization')!;
  const token = authHeader.split(' ')[1];

  try {
    const secret = new TextEncoder().encode(
      process.env.AUTH_SECRET || 'development-secret-change-in-production'
    );

    const { payload } = await jwtVerify(token, secret, {
      issuer: 'reimbursement-agent',
    });

    if (payload.type !== 'api_token') {
      return { success: false, error: 'Invalid token type', statusCode: 401 };
    }

    const userId = payload.sub;
    if (!userId) {
      return { success: false, error: 'Invalid token: missing subject', statusCode: 401 };
    }

    // 查找用户确保仍然存在
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return { success: false, error: 'User not found', statusCode: 401 };
    }

    return {
      success: true,
      context: {
        authType: 'session',
        userId: user.id,
        tenantId: user.tenantId ?? undefined,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId ?? undefined,
        },
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Token verification failed';
    if (message.includes('expired')) {
      return { success: false, error: 'Token expired', statusCode: 401 };
    }
    return { success: false, error: 'Invalid token', statusCode: 401 };
  }
}

// ============================================================================
// 审计日志
// ============================================================================

/**
 * 记录 Agent 操作审计日志
 */
export async function logAgentAction(params: {
  tenantId: string;
  apiKeyId: string;
  userId: string;
  action: string;
  method: string;
  path: string;
  statusCode?: number;
  agentType?: string;
  agentVersion?: string;
  requestSummary?: Record<string, unknown>;
  responseSummary?: Record<string, unknown>;
  entityType?: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  durationMs?: number;
}): Promise<void> {
  try {
    await db.insert(agentAuditLogs).values({
      tenantId: params.tenantId,
      apiKeyId: params.apiKeyId,
      userId: params.userId,
      action: params.action,
      method: params.method,
      path: params.path,
      statusCode: params.statusCode,
      agentType: params.agentType,
      agentVersion: params.agentVersion,
      requestSummary: params.requestSummary,
      responseSummary: params.responseSummary,
      entityType: params.entityType,
      entityId: params.entityId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      durationMs: params.durationMs,
    });
  } catch (error) {
    // 审计日志写入失败不应阻塞业务请求
    console.error('Failed to write agent audit log:', error);
  }
}

// ============================================================================
// 统一认证函数（Session + API Key 双模式）
// ============================================================================

/**
 * 统一认证入口
 *
 * 支持两种认证方式：
 * 1. NextAuth Session（浏览器用户）
 * 2. API Key（AI Agent / M2M）
 *
 * 使用方式：
 * ```
 * const authResult = await authenticate(request);
 * if (!authResult.success) {
 *   return NextResponse.json({ error: authResult.error }, { status: authResult.statusCode });
 * }
 * const { context } = authResult;
 * // context.authType === 'session' | 'api_key'
 * // context.user 包含用户信息
 * ```
 */
export async function authenticate(
  request: NextRequest,
  requiredScope?: ApiScope
): Promise<
  | { success: true; context: AuthContext }
  | { success: false; error: string; statusCode: number }
> {
  // 优先尝试 API Key 认证（rk_ 前缀）
  if (isApiKeyRequest(request)) {
    const result = await authenticateApiKey(request, requiredScope);
    if (!result.success) {
      return {
        success: false,
        error: result.error.error,
        statusCode: result.error.statusCode,
      };
    }

    const authContext: AuthContext = {
      authType: 'api_key',
      userId: result.context.userId,
      tenantId: result.context.tenantId,
      user: result.context.user,
      apiKey: {
        id: result.context.apiKeyId,
        scopes: result.context.scopes,
        agentType: result.context.agentType,
        limits: result.context.limits,
      },
    };

    // 速率限制检查
    const rateLimitResult = checkRateLimit(authContext);
    if (rateLimitResult && !rateLimitResult.allowed) {
      const retryAfter = Math.max(1, rateLimitResult.resetAt - Math.floor(Date.now() / 1000));
      return {
        success: false,
        error: `请求过于频繁，请 ${retryAfter} 秒后重试`,
        statusCode: 429,
      };
    }

    // 将限流信息附到上下文，方便路由注入 header
    if (rateLimitResult) {
      authContext.rateLimit = {
        limit: rateLimitResult.limit,
        remaining: rateLimitResult.remaining,
        resetAt: rateLimitResult.resetAt,
      };
    }

    return { success: true, context: authContext };
  }

  // 尝试 JWT bearer token 认证（由 /api/auth/api-token 签发）
  if (isJwtBearerRequest(request)) {
    return authenticateJwtBearer(request);
  }

  // 回退到 NextAuth Session 认证
  const { auth } = await import('@/lib/auth');
  const session = await auth();

  if (!session?.user) {
    return {
      success: false,
      error: '未登录',
      statusCode: 401,
    };
  }

  return {
    success: true,
    context: {
      authType: 'session',
      userId: session.user.id,
      tenantId: session.user.tenantId,
      user: {
        id: session.user.id,
        email: session.user.email || '',
        name: session.user.name || '',
        role: session.user.role,
        tenantId: session.user.tenantId,
      },
    },
  };
}
