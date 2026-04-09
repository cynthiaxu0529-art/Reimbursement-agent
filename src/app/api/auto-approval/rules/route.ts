/**
 * 自动审批规则 CRUD
 * GET    /api/auto-approval/rules        获取当前用户的所有规则
 * POST   /api/auto-approval/rules        创建规则
 * PUT    /api/auto-approval/rules        批量替换规则（来自 Chat 配置）
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { autoApprovalProfiles, autoApprovalRules } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

async function getProfileId(userId: string, tenantId: string): Promise<string | null> {
  const [profile] = await db
    .select({ id: autoApprovalProfiles.id })
    .from(autoApprovalProfiles)
    .where(
      and(
        eq(autoApprovalProfiles.userId, userId),
        eq(autoApprovalProfiles.tenantId, tenantId)
      )
    )
    .limit(1);
  return profile?.id ?? null;
}

// ── GET ──────────────────────────────────────
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const profileId = await getProfileId(session.user.id, session.user.tenantId);
  if (!profileId) {
    return NextResponse.json({ rules: [] });
  }

  const rules = await db
    .select()
    .from(autoApprovalRules)
    .where(eq(autoApprovalRules.profileId, profileId));

  return NextResponse.json({ rules });
}

// ── POST ─────────────────────────────────────
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  let profileId = await getProfileId(session.user.id, session.user.tenantId);

  // 如果没有 profile，先自动创建一个（禁用状态）
  if (!profileId) {
    const [inserted] = await db
      .insert(autoApprovalProfiles)
      .values({
        tenantId: session.user.tenantId,
        userId: session.user.id,
        isEnabled: false,
        updatedAt: new Date(),
      })
      .returning({ id: autoApprovalProfiles.id });
    profileId = inserted.id;
  }

  const body = await request.json();
  const { name, priority = 100, conditions = {}, action = 'approve' } = body;

  if (!name) {
    return NextResponse.json({ error: '规则名称不能为空' }, { status: 400 });
  }

  const [rule] = await db
    .insert(autoApprovalRules)
    .values({
      profileId,
      priority,
      name,
      conditions,
      action,
      isActive: true,
      updatedAt: new Date(),
    })
    .returning();

  return NextResponse.json({ rule });
}

// ── PUT ──────────────────────────────────────
// 批量替换所有规则（Chat 配置时使用）
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  let profileId = await getProfileId(session.user.id, session.user.tenantId);

  if (!profileId) {
    const [inserted] = await db
      .insert(autoApprovalProfiles)
      .values({
        tenantId: session.user.tenantId,
        userId: session.user.id,
        isEnabled: false,
        createdViaChat: true,
        updatedAt: new Date(),
      })
      .returning({ id: autoApprovalProfiles.id });
    profileId = inserted.id;
  }

  const body = await request.json();
  const { rules } = body as { rules: Array<{ name: string; priority?: number; conditions?: object; action?: string }> };

  if (!Array.isArray(rules)) {
    return NextResponse.json({ error: 'rules 必须是数组' }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    // 删除旧规则
    await tx.delete(autoApprovalRules).where(eq(autoApprovalRules.profileId, profileId!));

    // 插入新规则
    if (rules.length > 0) {
      await tx.insert(autoApprovalRules).values(
        rules.map((r, i) => ({
          profileId: profileId!,
          priority: r.priority ?? (i + 1) * 10,
          name: r.name,
          conditions: r.conditions ?? {},
          action: r.action ?? 'approve',
          isActive: true,
          updatedAt: new Date(),
        }))
      );
    }
  });

  const newRules = await db
    .select()
    .from(autoApprovalRules)
    .where(eq(autoApprovalRules.profileId, profileId));

  return NextResponse.json({ rules: newRules });
}
