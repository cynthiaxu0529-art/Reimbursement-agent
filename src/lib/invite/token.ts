/**
 * 邀请Token安全模块
 *
 * 使用加密签名的Token替代简单的Base64编码
 * 特性：
 * 1. Token包含签名，无法被篡改
 * 2. Token存储在数据库中，一次性使用
 * 3. Token有过期时间
 * 4. 使用SHA-256哈希存储，原始token只在邮件中发送
 */

import crypto from 'crypto';

// 邀请Token有效期（7天）
export const INVITATION_EXPIRY_DAYS = 7;

// 获取签名密钥（使用环境变量或默认值）
function getSecretKey(): string {
  return process.env.INVITATION_SECRET || process.env.AUTH_SECRET || 'default-invitation-secret-change-in-production';
}

/**
 * 邀请数据接口
 */
export interface InvitationData {
  invitationId: string;  // 数据库中的邀请记录ID
  email: string;
  tenantId: string;
  timestamp: number;
}

/**
 * 生成安全的邀请Token
 *
 * Token结构: base64(JSON(data) + '.' + signature)
 *
 * @param data 邀请数据
 * @returns 安全的邀请token
 */
export function generateInviteToken(data: InvitationData): string {
  const payload = JSON.stringify(data);
  const signature = crypto
    .createHmac('sha256', getSecretKey())
    .update(payload)
    .digest('hex');

  // 组合payload和签名
  const token = Buffer.from(`${payload}.${signature}`).toString('base64url');
  return token;
}

/**
 * 验证并解析邀请Token
 *
 * @param token 邀请token
 * @returns 解析后的数据，或null表示无效
 */
export function verifyInviteToken(token: string): InvitationData | null {
  try {
    // 解码token
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const [payloadStr, signature] = decoded.split('.');

    if (!payloadStr || !signature) {
      console.error('Invalid token format: missing payload or signature');
      return null;
    }

    // 验证签名
    const expectedSignature = crypto
      .createHmac('sha256', getSecretKey())
      .update(payloadStr)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.error('Invalid token: signature mismatch');
      return null;
    }

    // 解析payload
    const data = JSON.parse(payloadStr) as InvitationData;

    // 验证必要字段
    if (!data.invitationId || !data.email || !data.tenantId || !data.timestamp) {
      console.error('Invalid token: missing required fields');
      return null;
    }

    return data;
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

/**
 * 计算Token的哈希值（用于数据库存储）
 *
 * @param token 邀请token
 * @returns SHA-256哈希值
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * 计算邀请过期时间
 *
 * @param days 有效天数，默认7天
 * @returns 过期时间戳
 */
export function calculateExpiryDate(days: number = INVITATION_EXPIRY_DAYS): Date {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + days);
  return expiryDate;
}

/**
 * 检查邀请是否过期
 *
 * @param expiresAt 过期时间
 * @returns 是否已过期
 */
export function isInvitationExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

/**
 * 生成随机的邀请ID（用于额外安全）
 */
export function generateRandomId(): string {
  return crypto.randomUUID();
}

// ============ 旧版Token兼容（过渡期使用） ============

/**
 * 旧版邀请数据接口
 */
export interface LegacyInviteData {
  email: string;
  tenantId: string;
  roles?: string[];
  department?: string;
  departmentId?: string;
  setAsDeptManager?: boolean;
  timestamp?: number;
}

/**
 * 尝试解析旧版Base64 Token（仅用于兼容过渡）
 *
 * @param token 可能是旧版token
 * @returns 解析后的数据，或null
 */
export function parseLegacyToken(token: string): LegacyInviteData | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const data = JSON.parse(decoded) as LegacyInviteData;

    // 验证必要字段
    if (!data.email || !data.tenantId) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * 判断Token是新版还是旧版
 *
 * @param token token字符串
 * @returns 'new' | 'legacy' | 'invalid'
 */
export function detectTokenVersion(token: string): 'new' | 'legacy' | 'invalid' {
  // 先尝试新版token
  const newTokenData = verifyInviteToken(token);
  if (newTokenData) {
    return 'new';
  }

  // 尝试旧版token
  const legacyData = parseLegacyToken(token);
  if (legacyData) {
    return 'legacy';
  }

  return 'invalid';
}
