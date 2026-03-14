/**
 * 幂等性支持
 *
 * Agent 在 POST 请求头中携带 `Idempotency-Key`，
 * 如果相同 key 在 TTL 内重复请求，直接返回缓存的首次响应，
 * 避免网络重试导致重复创建资源。
 *
 * 使用内存 Map 实现（单实例足够；如需多实例可替换为 Redis）。
 */

import { NextRequest, NextResponse } from 'next/server';

interface CachedResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
  createdAt: number;
}

/** 缓存 TTL：15 分钟 */
const TTL_MS = 15 * 60 * 1000;

/** 最大缓存条目数（防止内存泄漏） */
const MAX_ENTRIES = 10_000;

const cache = new Map<string, CachedResponse>();

/** 定期清理过期条目 */
let cleanupScheduled = false;
function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  setTimeout(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now - entry.createdAt > TTL_MS) {
        cache.delete(key);
      }
    }
    cleanupScheduled = false;
  }, 60_000); // 每分钟清理一次
}

/**
 * 从请求头提取幂等性 key
 * 返回 null 表示请求没有要求幂等性
 */
export function getIdempotencyKey(request: NextRequest): string | null {
  return request.headers.get('idempotency-key');
}

/**
 * 检查是否有缓存的响应
 * 如果有，直接返回 NextResponse；否则返回 null
 */
export function getCachedResponse(key: string): NextResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;

  // 检查是否过期
  if (Date.now() - entry.createdAt > TTL_MS) {
    cache.delete(key);
    return null;
  }

  const response = new NextResponse(entry.body, {
    status: entry.status,
    headers: {
      ...entry.headers,
      'Idempotency-Replay': 'true',
    },
  });
  return response;
}

/**
 * 缓存响应（在首次成功处理后调用）
 */
export async function cacheResponse(
  key: string,
  response: NextResponse,
): Promise<void> {
  // 仅缓存成功响应（2xx）
  if (response.status < 200 || response.status >= 300) return;

  // 防止缓存膨胀
  if (cache.size >= MAX_ENTRIES) {
    // 删除最旧的 10% 条目
    const toDelete = Math.floor(MAX_ENTRIES * 0.1);
    const keys = cache.keys();
    for (let i = 0; i < toDelete; i++) {
      const next = keys.next();
      if (next.done) break;
      cache.delete(next.value);
    }
  }

  // 克隆 body 再缓存
  const body = await response.clone().text();

  cache.set(key, {
    status: response.status,
    body,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/json',
    },
    createdAt: Date.now(),
  });

  scheduleCleanup();
}
