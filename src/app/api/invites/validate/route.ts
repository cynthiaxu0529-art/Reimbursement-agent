import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { invitations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  verifyInviteToken,
  hashToken,
  isInvitationExpired,
  parseLegacyToken,
  detectTokenVersion,
} from '@/lib/invite';

export const dynamic = 'force-dynamic';

/**
 * POST /api/invites/validate - 验证邀请Token
 */
export async function POST(request: NextRequest) {
  try {
    const { token, email } = await request.json();

    if (!token) {
      return NextResponse.json({
        valid: false,
        error: '缺少邀请token',
        code: 'MISSING_TOKEN',
      });
    }

    // 检测token版本
    console.log('[Invite Validate] Token received:', token.substring(0, 20) + '...', 'length:', token.length);
    const tokenVersion = detectTokenVersion(token);
    console.log('[Invite Validate] Token version:', tokenVersion);

    if (tokenVersion === 'invalid') {
      return NextResponse.json({
        valid: false,
        error: '邀请链接格式无效，请联系管理员重新发送邀请',
        code: 'INVALID_FORMAT',
      });
    }

    if (tokenVersion === 'new') {
      const tokenData = verifyInviteToken(token);
      if (!tokenData) {
        return NextResponse.json({
          valid: false,
          error: '邀请链接签名无效，可能已被篡改或服务器配置已更改',
          code: 'INVALID_SIGNATURE',
        });
      }

      // 验证邮箱匹配
      if (email && tokenData.email.toLowerCase() !== email.toLowerCase()) {
        return NextResponse.json({
          valid: false,
          error: '邮箱与邀请不匹配',
          code: 'EMAIL_MISMATCH',
        });
      }

      // 查找邀请记录
      const tokenHashValue = hashToken(token);
      const invitation = await db.query.invitations.findFirst({
        where: and(
          eq(invitations.id, tokenData.invitationId),
          eq(invitations.tokenHash, tokenHashValue)
        ),
      });

      if (!invitation) {
        return NextResponse.json({
          valid: false,
          error: '邀请记录不存在，可能已被删除',
          code: 'NOT_FOUND',
        });
      }

      // 验证状态
      if (invitation.status !== 'pending') {
        const statusMessages: Record<string, string> = {
          accepted: '该邀请已被使用',
          expired: '该邀请已过期',
          revoked: '该邀请已被撤销',
        };
        return NextResponse.json({
          valid: false,
          error: statusMessages[invitation.status] || '邀请无效',
          code: 'INVALID_STATUS',
          status: invitation.status,
        });
      }

      // 检查过期
      if (isInvitationExpired(invitation.expiresAt)) {
        await db.update(invitations)
          .set({ status: 'expired', updatedAt: new Date() })
          .where(eq(invitations.id, invitation.id));

        return NextResponse.json({
          valid: false,
          error: '邀请已过期，请联系管理员重新发送',
          code: 'EXPIRED',
        });
      }

      return NextResponse.json({
        valid: true,
        email: tokenData.email,
        expiresAt: invitation.expiresAt,
      });

    } else if (tokenVersion === 'legacy') {
      const legacyData = parseLegacyToken(token);
      if (!legacyData) {
        return NextResponse.json({
          valid: false,
          error: '旧版邀请链接无效',
          code: 'LEGACY_INVALID',
        });
      }

      if (email && legacyData.email.toLowerCase() !== email.toLowerCase()) {
        return NextResponse.json({
          valid: false,
          error: '邮箱与邀请不匹配',
          code: 'EMAIL_MISMATCH',
        });
      }

      return NextResponse.json({
        valid: true,
        email: legacyData.email,
        legacy: true,
      });
    }

    return NextResponse.json({
      valid: false,
      error: '未知错误',
      code: 'UNKNOWN',
    });

  } catch (error) {
    console.error('[Invite Validate] Error:', error);
    return NextResponse.json({
      valid: false,
      error: '验证邀请时出错',
      code: 'SERVER_ERROR',
    });
  }
}
