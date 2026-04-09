/**
 * 财务自动付款配置 CRUD
 * GET  /api/auto-payment/profile  获取当前租户的付款配置
 * POST /api/auto-payment/profile  创建或更新（需要 finance/admin 角色）
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { autoPaymentProfiles, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserRoles, canProcessPayment } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

const SYSTEM_MAX_PAYMENT_USD = 500;

// ── GET ──────────────────────────────────────
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const [profile] = await db
    .select()
    .from(autoPaymentProfiles)
    .where(eq(autoPaymentProfiles.tenantId, session.user.tenantId))
    .limit(1);

  return NextResponse.json({ profile: profile ?? null });
}

// ── POST ─────────────────────────────────────
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  // 只有财务/管理员可配置
  const [currentUser] = await db
    .select({ role: users.role, roles: users.roles })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!canProcessPayment(getUserRoles(currentUser || {}))) {
    return NextResponse.json({ error: '需要财务或管理员权限' }, { status: 403 });
  }

  const body = await request.json();
  const {
    isEnabled = false,
    conditions = {},
    expiresAt,
  } = body;

  // 强制金额上限不超过系统上限
  if (conditions.maxAmountPerReimbursementUSD) {
    conditions.maxAmountPerReimbursementUSD = Math.min(
      conditions.maxAmountPerReimbursementUSD,
      SYSTEM_MAX_PAYMENT_USD
    );
  }

  // 有效期最长6个月
  const maxExpiry = new Date();
  maxExpiry.setMonth(maxExpiry.getMonth() + 6);
  const effectiveExpiry = expiresAt
    ? (new Date(expiresAt) > maxExpiry ? maxExpiry : new Date(expiresAt))
    : maxExpiry;

  const now = new Date();

  const existing = await db
    .select({ id: autoPaymentProfiles.id })
    .from(autoPaymentProfiles)
    .where(eq(autoPaymentProfiles.tenantId, session.user.tenantId))
    .limit(1);

  let profileId: string;

  if (existing.length > 0) {
    profileId = existing[0].id;
    await db
      .update(autoPaymentProfiles)
      .set({ isEnabled, conditions, expiresAt: effectiveExpiry, updatedAt: now })
      .where(eq(autoPaymentProfiles.id, profileId));
  } else {
    const [inserted] = await db
      .insert(autoPaymentProfiles)
      .values({
        tenantId: session.user.tenantId,
        createdByUserId: session.user.id,
        isEnabled,
        conditions,
        expiresAt: effectiveExpiry,
        updatedAt: now,
      })
      .returning({ id: autoPaymentProfiles.id });
    profileId = inserted.id;
  }

  const [profile] = await db
    .select()
    .from(autoPaymentProfiles)
    .where(eq(autoPaymentProfiles.id, profileId))
    .limit(1);

  return NextResponse.json({ profile });
}
