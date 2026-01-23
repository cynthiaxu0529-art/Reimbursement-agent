import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, checkEmailConfig } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // 检查配置
  const config = checkEmailConfig();

  const configDetails = {
    provider: process.env.EMAIL_PROVIDER || 'smtp (default)',
    configured: config.configured,
    error: config.error,
    smtp: {
      host: process.env.SMTP_HOST ? '✓ 已设置' : '✗ 未设置',
      user: process.env.SMTP_USER ? '✓ 已设置' : '✗ 未设置',
      pass: process.env.SMTP_PASS ? '✓ 已设置' : '✗ 未设置',
      port: process.env.SMTP_PORT || '未设置 (默认 465)',
      secure: process.env.SMTP_SECURE || '未设置 (默认 false)',
      from: process.env.EMAIL_FROM || '未设置',
    },
    resend: {
      apiKey: process.env.RESEND_API_KEY ? '✓ 已设置' : '✗ 未设置',
      fromEmail: process.env.RESEND_FROM_EMAIL || '未设置',
    },
  };

  return NextResponse.json({
    success: true,
    config: configDetails,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { testEmail } = body;

    if (!testEmail) {
      return NextResponse.json({
        success: false,
        error: '请提供测试邮箱地址'
      }, { status: 400 });
    }

    // 检查配置
    const config = checkEmailConfig();
    if (!config.configured) {
      return NextResponse.json({
        success: false,
        error: `邮件服务未配置: ${config.error}`,
        provider: config.provider,
      }, { status: 500 });
    }

    // 发送测试邮件
    const result = await sendEmail({
      to: testEmail,
      subject: '报销系统邮件测试',
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2 style="color: #7c3aed;">邮件配置测试成功！</h2>
          <p>如果您收到这封邮件，说明邮件服务已正确配置。</p>
          <p style="color: #6b7280; font-size: 14px;">
            发送时间: ${new Date().toLocaleString('zh-CN')}<br>
            发送方式: ${config.provider.toUpperCase()}
          </p>
        </div>
      `,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `测试邮件已发送至 ${testEmail}`,
        provider: config.provider,
        messageId: result.messageId,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
        provider: config.provider,
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Test email error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '发送失败',
    }, { status: 500 });
  }
}
