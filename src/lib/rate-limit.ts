/**
 * API Key 请求速率限制
 *
 * 基于滑动窗口计数器，使用内存 Map 实现。
 * 每个 API Key 独立计数，限额从 apiKeys 表的 rateLimitPerMinute / rateLimitPerDay 字段读取。
 *
 * 返回标准限流响应头：
 * - X-RateLimit-Limit
 * - X-RateLimit-Remaining
 * - X-RateLimit-Reset（Unix 时间戳）
 * - Retry-After（秒）
 */

import { NextResponse } from 'next/server';
import type { AuthContext } from '@/lib/auth/api-key';

interface WindowCounter {
  /** 当前窗口的请求计数 */
  count: number;
  /** 窗口开始时间（ms） */
  windowStart: number;
}

/** apiKeyId -> 分钟级计数器 */
const minuteCounters = new Map<string, WindowCounter>();

/** apiKeyId -> 天级计数器 */
const dayCounters = new Map<string, WindowCounter>();

const ONE_MINUTE = 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

function getOrResetCounter(
  map: Map<string, WindowCounter>,
  key: string,
  windowMs: number,
): WindowCounter {
  const now = Date.now();
  const existing = map.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    const counter: WindowCounter = { count: 0, windowStart: now };
    map.set(key, counter);
    return counter;
  }

  return existing;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // Unix 时间戳（秒）
}

/**
 * 检查 API Key 是否超过速率限制
 *
 * @param authCtx 认证上下文（仅对 api_key 类型生效）
 * @returns null 表示无需限流（如 session 认证），否则返回限流状态
 */
export function checkRateLimit(authCtx: AuthContext): RateLimitResult | null {
  // 仅对 API Key 请求限流
  if (authCtx.authType !== 'api_key' || !authCtx.apiKey) return null;

  const apiKeyId = authCtx.apiKey.id;

  // 从 API Key 配置获取限制（默认 60/min, 1000/day）
  const limitPerMinute = (authCtx.apiKey as any).rateLimitPerMinute ?? 60;
  const limitPerDay = (authCtx.apiKey as any).rateLimitPerDay ?? 1000;

  // 分钟级检查
  const minuteCounter = getOrResetCounter(minuteCounters, apiKeyId, ONE_MINUTE);
  const minuteResetAt = Math.ceil((minuteCounter.windowStart + ONE_MINUTE) / 1000);
  const minuteRemaining = Math.max(0, limitPerMinute - minuteCounter.count);

  if (minuteCounter.count >= limitPerMinute) {
    return {
      allowed: false,
      limit: limitPerMinute,
      remaining: 0,
      resetAt: minuteResetAt,
    };
  }

  // 天级检查
  const dayCounter = getOrResetCounter(dayCounters, apiKeyId, ONE_DAY);
  const dayResetAt = Math.ceil((dayCounter.windowStart + ONE_DAY) / 1000);
  const dayRemaining = Math.max(0, limitPerDay - dayCounter.count);

  if (dayCounter.count >= limitPerDay) {
    return {
      allowed: false,
      limit: limitPerDay,
      remaining: 0,
      resetAt: dayResetAt,
    };
  }

  // 通过：递增计数器
  minuteCounter.count++;
  dayCounter.count++;

  // 返回最紧张的那个维度
  const effectiveRemaining = Math.min(minuteRemaining - 1, dayRemaining - 1);
  const effectiveLimit = Math.min(limitPerMinute, limitPerDay);
  const effectiveReset = minuteRemaining < dayRemaining ? minuteResetAt : dayResetAt;

  return {
    allowed: true,
    limit: effectiveLimit,
    remaining: Math.max(0, effectiveRemaining),
    resetAt: effectiveReset,
  };
}

/**
 * 向响应中注入标准限流 header
 */
export function withRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult,
): NextResponse {
  response.headers.set('X-RateLimit-Limit', String(result.limit));
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  response.headers.set('X-RateLimit-Reset', String(result.resetAt));

  if (!result.allowed) {
    const retryAfter = Math.max(1, result.resetAt - Math.floor(Date.now() / 1000));
    response.headers.set('Retry-After', String(retryAfter));
  }

  return response;
}
