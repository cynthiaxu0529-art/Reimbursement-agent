import { NextRequest, NextResponse } from 'next/server';
import { auth, canInviteRoles, INVITE_ROLE_MAPPING, type Role } from '@/lib/auth';
import { sendEmail, checkEmailConfig } from '@/lib/email';
import { db } from '@/lib/db';
import { users, invitations, tenants } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  generateInviteToken,
  hashToken,
  calculateExpiryDate,
  type InvitationData,
} from '@/lib/invite';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '未授权' }, { status: 401 });
    }

    // Get inviter's tenant ID
    const inviter = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!inviter?.tenantId) {
      return NextResponse.json({ success: false, error: '您还未加入公司，无法邀请成员' }, { status: 400 });
    }

    // 获取公司名称
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, inviter.tenantId),
    });
    const tenantName = tenant?.name || '公司';

    // Check email configuration
    const emailConfig = checkEmailConfig();
    if (!emailConfig.configured) {
      return NextResponse.json({
        success: false,
        error: `邮件服务未配置: ${emailConfig.error}`
      }, { status: 500 });
    }

    const body = await request.json();
    const { email, name, department, departmentId, roles, setAsDeptManager } = body;
    // 使用数据库中的公司名称
    const companyName = tenantName;

    if (!email) {
      return NextResponse.json({ success: false, error: '邮箱地址必填' }, { status: 400 });
    }

    // 检查用户是否已存在
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (existingUser) {
      return NextResponse.json({ success: false, error: '该邮箱已注册' }, { status: 400 });
    }

    // 映射角色名称到数据库角色
    const requestedRoles = (roles || ['employee']).map((r: string) => {
      return INVITE_ROLE_MAPPING[r] || 'employee';
    }) as Role[];

    // 验证邀请权限：只能邀请同级或更低级别的角色
    const inviterRole = inviter.role as Role;
    if (!canInviteRoles(inviterRole, requestedRoles)) {
      return NextResponse.json({
        success: false,
        error: '您没有权限邀请该角色级别的用户'
      }, { status: 403 });
    }

    // 检查是否有未过期的待处理邀请
    const existingInvitation = await db.query.invitations.findFirst({
      where: and(
        eq(invitations.email, email),
        eq(invitations.tenantId, inviter.tenantId),
        eq(invitations.status, 'pending')
      ),
    });

    if (existingInvitation) {
      // 检查是否过期
      if (new Date() < existingInvitation.expiresAt) {
        return NextResponse.json({
          success: false,
          error: '该邮箱已有待处理的邀请，请等待对方接受或邀请过期后重试'
        }, { status: 400 });
      }
      // 如果已过期，更新状态
      await db.update(invitations)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(invitations.id, existingInvitation.id));
    }

    // 创建邀请记录
    const expiresAt = calculateExpiryDate(7); // 7天有效期
    const [invitation] = await db.insert(invitations).values({
      tenantId: inviter.tenantId,
      email,
      name: name || null,
      roles: requestedRoles,
      departmentId: departmentId || null,
      setAsDeptManager: setAsDeptManager || false,
      tokenHash: '', // 临时占位，稍后更新
      expiresAt,
      createdBy: session.user.id,
    }).returning();

    // 生成安全的邀请Token
    const tokenData: InvitationData = {
      invitationId: invitation.id,
      email,
      tenantId: inviter.tenantId,
      timestamp: Date.now(),
    };
    const inviteToken = generateInviteToken(tokenData);

    // 更新token哈希
    await db.update(invitations)
      .set({ tokenHash: hashToken(inviteToken) })
      .where(eq(invitations.id, invitation.id));

    // Build invite URL
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const inviteUrl = `${baseUrl}/register?invite=${inviteToken}&email=${encodeURIComponent(email)}`;

    // Format roles for display
    const roleLabels: Record<string, string> = {
      employee: '员工',
      approver: '审批人',
      admin: '管理员',
      finance: '财务',
    };
    const rolesText = roles?.map((r: string) => roleLabels[r] || r).join('、') || '员工';

    // Build email HTML
    const htmlContent = `
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
                    <div style="width: 56px; height: 56px; background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); border-radius: 12px; margin: 0 auto 20px;">
                      <table width="100%" height="100%"><tr><td align="center" valign="middle" style="color: white; font-size: 24px; font-weight: bold;">R</td></tr></table>
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
    `;

    // Send email using the configured provider (Resend or SMTP)
    const result = await sendEmail({
      to: email,
      subject: `${companyName || '公司'} 邀请您加入报销系统`,
      html: htmlContent,
    });

    if (!result.success) {
      console.error('Email send error:', result.error);
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        invitationId: invitation.id,
        messageId: result.messageId,
        email,
        expiresAt: expiresAt.toISOString(),
        provider: emailConfig.provider,
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
