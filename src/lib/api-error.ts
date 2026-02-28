/**
 * 统一 API 错误响应工具
 *
 * 返回格式兼容前端（浏览器）和 Agent（API Key）双方：
 * {
 *   "success": false,
 *   "error": "人类可读的描述",       ← 前端直接用 result.error 显示
 *   "error_code": "MACHINE_CODE"     ← Agent 用来程序化判断错误类型
 * }
 *
 * 前端现有代码大量使用 `result.error` 作为字符串，
 * 所以 error 字段必须保持为字符串，不能改成对象。
 */

import { NextResponse } from 'next/server';

export interface ApiErrorBody {
  success: false;
  error: string;
  error_code: string;
}

/**
 * 构造统一格式的错误 JSON 响应
 *
 * @param message  人类可读的错误描述
 * @param status   HTTP 状态码（默认 400）
 * @param code     机器可读的错误码（默认按 status 自动推断）
 */
export function apiError(
  message: string,
  status: number = 400,
  code?: string,
): NextResponse<ApiErrorBody> {
  const resolvedCode = code ?? defaultCode(status);
  return NextResponse.json(
    {
      success: false as const,
      error: message,
      error_code: resolvedCode,
    },
    { status },
  );
}

function defaultCode(status: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 429: return 'RATE_LIMITED';
    default:  return 'INTERNAL_ERROR';
  }
}
