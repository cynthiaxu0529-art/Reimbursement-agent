import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { users, passwordResetTokens } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json(
        { error: '缺少必填字段' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: '密码至少需要 8 个字符' },
        { status: 400 }
      );
    }

    // 验证 token
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resetToken = await db.query.passwordResetTokens.findFirst({
      where: and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
      ),
    });

    if (!resetToken) {
      return NextResponse.json(
        { error: '重置链接无效或已使用' },
        { status: 400 }
      );
    }

    // 检查是否过期
    if (new Date() > resetToken.expiresAt) {
      return NextResponse.json(
        { error: '重置链接已过期，请重新申请' },
        { status: 400 }
      );
    }

    // 更新密码
    const passwordHash = await bcrypt.hash(password, 12);

    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, resetToken.userId));

    // 标记 token 为已使用
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, resetToken.id));

    return NextResponse.json({
      success: true,
      message: '密码已重置，请使用新密码登录',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: '重置失败，请稍后重试' },
      { status: 500 }
    );
  }
}
