/**
 * 自动审批配置 CRUD
 * GET    /api/auto-approval/profile  获取当前用户的配置（含规则列表）
 * POST   /api/auto-approval/profile  创建或更新配置
 * DELETE /api/auto-approval/profile  停用配置
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { autoApprovalProfiles, autoApprovalRules } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { SYSTEM_MAX_AMOUNT_USD, SYSTEM_DAILY_LIMIT_USD } from '@/lib/auto-approval/risk-checker';

export const dynamic = 'force-dynamic';

// ── GET ──────────────────────────────────────
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const [profile] = await db
    .select()
    .from(autoApprovalProfiles)
    .where(
      and(
        eq(autoApprovalProfiles.userId, session.user.id),
        eq(autoApprovalProfiles.tenantId, session.user.tenantId)
      )
    )
    .limit(1);

  if (!profile) {
    return NextResponse.json({ profile: null, rules: [] });
  }

  const rules = await db
    .select()
    .from(autoApprovalRules)
    .where(eq(autoApprovalRules.profileId, profile.id));

  return NextResponse.json({ profile, rules });
}

// ── POST ─────────────────────────────────────
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const body = await request.json();
  const {
    isEnabled = false,
    maxAmountCapUSD,
    dailyLimitUSD,
    cancellationWindowMinutes,
    expiresAt,
    createdViaChat = false,
  } = body;

  // 强制不超过系统上限
  const cappedAmount = Math.min(maxAmountCapUSD ?? SYSTEM_MAX_AMOUNT_USD, SYSTEM_MAX_AMOUNT_USD);
  const cappedDaily = Math.min(dailyLimitUSD ?? SYSTEM_DAILY_LIMIT_USD, SYSTEM_DAILY_LIMIT_USD);

  // 有效期最长6个月
  const maxExpiry = new Date();
  maxExpiry.setMonth(maxExpiry.getMonth() + 6);
  const parsedExpiry = expiresAt ? new Date(expiresAt) : maxExpiry;
  const effectiveExpiry = parsedExpiry > maxExpiry ? maxExpiry : parsedExpiry;

  const now = new Date();

  const existing = await db
    .select({ id: autoApprovalProfiles.id })
    .from(autoApprovalProfiles)
    .where(
      and(
        eq(autoApprovalProfiles.userId, session.user.id),
        eq(autoApprovalProfiles.tenantId, session.user.tenantId)
      )
    )
    .limit(1);

  let profileId: string;

  if (existing.length > 0) {
    profileId = existing[0].id;
    await db
      .update(autoApprovalProfiles)
      .set({
        isEnabled,
        maxAmountCapUSD: cappedAmount,
        dailyLimitUSD: cappedDaily,
        cancellationWindowMinutes: cancellationWindowMinutes ?? 60,
        expiresAt: effectiveExpiry,
        updatedAt: now,
      })
      .where(eq(autoApprovalProfiles.id, profileId));
  } else {
    const [inserted] = await db
      .insert(autoApprovalProfiles)
      .values({
        tenantId: session.user.tenantId,
        userId: session.user.id,
        isEnabled,
        maxAmountCapUSD: cappedAmount,
        dailyLimitUSD: cappedDaily,
        cancellationWindowMinutes: cancellationWindowMinutes ?? 60,
        expiresAt: effectiveExpiry,
        createdViaChat,
        updatedAt: now,
      })
      .returning({ id: autoApprovalProfiles.id });

    profileId = inserted.id;
  }

  const [profile] = await db
    .select()
    .from(autoApprovalProfiles)
    .where(eq(autoApprovalProfiles.id, profileId))
    .limit(1);

  return NextResponse.json({ profile });
}

// ── DELETE ────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  await db
    .update(autoApprovalProfiles)
    .set({ isEnabled: false, updatedAt: new Date() })
    .where(
      and(
        eq(autoApprovalProfiles.userId, session.user.id),
        eq(autoApprovalProfiles.tenantId, session.user.tenantId)
      )
    );

  return NextResponse.json({ ok: true });
}
