/**
 * 统一 API 错误响应工具
 *
 * 确保所有端点返回一致的错误格式，方便 Agent 程序化解析：
 * {
 *   "success": false,
 *   "error": {
 *     "code": "ERROR_CODE",
 *     "message": "人类可读的描述"
 *   }
 * }
 */

import { NextResponse } from 'next/server';

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
  };
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
      error: { code: resolvedCode, message },
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
