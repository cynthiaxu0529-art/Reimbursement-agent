/**
 * API Token 端点
 *
 * POST /api/auth/api-token
 *
 * 允许外部系统（如 Accounting Agent）通过 email + password 获取 JWT bearer token，
 * 用于后续 API 调用的认证，无需走浏览器 cookie 流程。
 *
 * 请求：
 *   { "email": "...", "password": "..." }
 *
 * 响应（成功）：
 *   { "token": "eyJ...", "expires_at": "2026-03-06T...", "token_type": "Bearer" }
 *
 * 使用：
 *   Authorization: Bearer eyJ...
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

export const dynamic = 'force-dynamic';

/** Token 有效期：24 小时 */
const TOKEN_EXPIRY_HOURS = 24;

function getJwtSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET || 'development-secret-change-in-production';
  return new TextEncoder().encode(secret);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required', code: 'MISSING_CREDENTIALS' },
        { status: 400 }
      );
    }

    // 查找用户
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' },
        { status: 401 }
      );
    }

    // 验证密码
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' },
        { status: 401 }
      );
    }

    // 生成 JWT
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    const token = await new SignJWT({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      type: 'api_token',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .setIssuer('reimbursement-agent')
      .sign(getJwtSecret());

    return NextResponse.json({
      token,
      token_type: 'Bearer',
      expires_at: expiresAt.toISOString(),
      expires_in: TOKEN_EXPIRY_HOURS * 3600,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('API token error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
