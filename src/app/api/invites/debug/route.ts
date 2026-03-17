import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/invites/debug - 调试邀请Token（临时使用）
 */
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'Missing token' });
    }

    // 获取 secret 信息
    const invitationSecret = process.env.INVITATION_SECRET;
    const authSecret = process.env.AUTH_SECRET;
    const secretUsed = invitationSecret || authSecret || 'default-invitation-secret-change-in-production';

    // 解码 token
    let decoded: string;
    try {
      decoded = Buffer.from(token, 'base64url').toString('utf-8');
    } catch {
      return NextResponse.json({
        error: 'Failed to decode token',
        tokenLength: token.length,
        tokenPreview: token.substring(0, 30) + '...',
      });
    }

    // 使用 lastIndexOf 分割
    const lastDotIndex = decoded.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return NextResponse.json({
        error: 'No dot separator found',
        decoded: decoded.substring(0, 100) + '...',
      });
    }

    const payloadStr = decoded.substring(0, lastDotIndex);
    const signature = decoded.substring(lastDotIndex + 1);

    // 解析 payload
    let payload;
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      return NextResponse.json({
        error: 'Failed to parse payload JSON',
        payloadStr: payloadStr.substring(0, 100),
      });
    }

    // 计算期望的签名
    const expectedSignature = crypto
      .createHmac('sha256', secretUsed)
      .update(payloadStr)
      .digest('hex');

    const signatureMatch = signature === expectedSignature;

    return NextResponse.json({
      success: true,
      hasInvitationSecret: !!invitationSecret,
      hasAuthSecret: !!authSecret,
      secretPreview: secretUsed.substring(0, 4) + '...' + secretUsed.substring(secretUsed.length - 4),
      secretLength: secretUsed.length,
      payload,
      tokenSignature: signature.substring(0, 16) + '...',
      expectedSignature: expectedSignature.substring(0, 16) + '...',
      signatureMatch,
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
