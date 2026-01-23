import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '未授权' }, { status: 401 });
    }

    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({
        success: false,
        error: '邮件服务未配置，请联系管理员设置 RESEND_API_KEY'
      }, { status: 500 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const body = await request.json();
    const { email, name, department, roles, companyName } = body;

    if (!email) {
      return NextResponse.json({ success: false, error: '邮箱地址必填' }, { status: 400 });
    }

    // Generate invite token (in production, save this to database)
    const inviteToken = Buffer.from(`${email}-${Date.now()}`).toString('base64');

    // Build invite URL
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const inviteUrl = `${baseUrl}/register?invite=${inviteToken}&email=${encodeURIComponent(email)}`;

    // Format roles for display
    const roleLabels: Record<string, string> = {
      employee: '员工',
      approver: '审批人',
      admin: '管理员',
    };
    const rolesText = roles?.map((r: string) => roleLabels[r] || r).join('、') || '员工';

    // Send email using Resend
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: email,
      subject: `${companyName || '公司'} 邀请您加入报销系统`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
                  <!-- Header -->
                  <tr>
                    <td style="padding: 40px 40px 24px; text-align: center;">
                      <div style="width: 56px; height: 56px; background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); border-radius: 12px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                        <span style="font-size: 24px; color: white;">R</span>
                      </div>
                      <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #111827;">
                        您收到了一份邀请
                      </h1>
                    </td>
                  </tr>

                  <!-- Content -->
                  <tr>
                    <td style="padding: 0 40px 32px;">
                      <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #374151;">
                        ${name ? `您好，${name}！` : '您好！'}
                      </p>
                      <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #374151;">
                        <strong>${companyName || '公司'}</strong> 邀请您加入智能报销系统。完成注册后，您将可以：
                      </p>

                      <ul style="margin: 0 0 24px; padding-left: 20px; font-size: 15px; line-height: 1.8; color: #4b5563;">
                        <li>提交和管理报销申请</li>
                        <li>上传凭证自动识别</li>
                        <li>实时跟踪审批进度</li>
                      </ul>

                      <!-- Info Box -->
                      <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          ${name ? `
                          <tr>
                            <td style="padding: 4px 0; font-size: 14px; color: #6b7280;">姓名</td>
                            <td style="padding: 4px 0; font-size: 14px; color: #111827; text-align: right;">${name}</td>
                          </tr>
                          ` : ''}
                          ${department ? `
                          <tr>
                            <td style="padding: 4px 0; font-size: 14px; color: #6b7280;">部门</td>
                            <td style="padding: 4px 0; font-size: 14px; color: #111827; text-align: right;">${department}</td>
                          </tr>
                          ` : ''}
                          <tr>
                            <td style="padding: 4px 0; font-size: 14px; color: #6b7280;">角色</td>
                            <td style="padding: 4px 0; font-size: 14px; color: #111827; text-align: right;">${rolesText}</td>
                          </tr>
                        </table>
                      </div>

                      <!-- CTA Button -->
                      <div style="text-align: center;">
                        <a href="${inviteUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); color: white; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                          接受邀请并注册
                        </a>
                      </div>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="padding: 24px 40px; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0 0 8px; font-size: 13px; color: #9ca3af; text-align: center;">
                        如果按钮无法点击，请复制以下链接到浏览器：
                      </p>
                      <p style="margin: 0; font-size: 12px; color: #6b7280; text-align: center; word-break: break-all;">
                        ${inviteUrl}
                      </p>
                    </td>
                  </tr>

                  <!-- Copyright -->
                  <tr>
                    <td style="padding: 0 40px 32px;">
                      <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                        此邮件由 ${companyName || '智能报销系统'} 自动发送，请勿回复。
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        messageId: data?.id,
        email,
        inviteToken,
      },
    });
  } catch (error) {
    console.error('Send invite error:', error);
    return NextResponse.json(
      { success: false, error: '发送邀请失败' },
      { status: 500 }
    );
  }
}
