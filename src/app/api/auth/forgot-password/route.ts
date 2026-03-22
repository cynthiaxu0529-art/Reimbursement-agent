import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { users, passwordResetTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: '请输入邮箱地址' },
        { status: 400 }
      );
    }

    // 查找用户（无论是否存在都返回成功，防止枚举攻击）
    const user = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase().trim()),
    });

    if (user && user.passwordHash) {
      try {
        // 生成随机 token
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 小时过期

        // 保存 token
        await db.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash,
          expiresAt,
        });

        // 构建重置链接
        const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
        const resetUrl = `${baseUrl}/reset-password?token=${token}`;

        // 发送邮件
        await sendEmail({
          to: user.email,
          subject: '重置密码 / Reset Your Password',
          html: `
            <div style="max-width: 480px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); border-radius: 12px; display: inline-flex; align-items: center; justify-content: center;">
                  <span style="color: white; font-weight: bold; font-size: 1.5rem;">R</span>
                </div>
              </div>
              <h2 style="text-align: center; color: #111827;">重置密码 / Reset Password</h2>
              <p style="color: #6b7280;">Hi ${user.name},</p>
              <p style="color: #6b7280;">点击下方按钮重置你的密码。链接有效期为 1 小时。</p>
              <p style="color: #6b7280;">Click the button below to reset your password. This link expires in 1 hour.</p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${resetUrl}" style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
                  重置密码 / Reset Password
                </a>
              </div>
              <p style="color: #9ca3af; font-size: 0.875rem;">如果你没有请求重置密码，请忽略此邮件。</p>
              <p style="color: #9ca3af; font-size: 0.875rem;">If you didn't request this, you can safely ignore this email.</p>
            </div>
          `,
        });
      } catch (innerError) {
        // 记录错误但仍返回成功，防止枚举攻击
        console.error('Failed to send reset email:', innerError);
      }
    }

    // 无论用户是否存在或发送是否成功，都返回成功（防止邮箱枚举）
    return NextResponse.json({
      success: true,
      message: '如果该邮箱已注册，重置链接已发送到你的邮箱',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: '发送失败，请稍后重试' },
      { status: 500 }
    );
  }
}
