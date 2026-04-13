/**
 * POST /api/setup/create-company
 *
 * 为没有关联公司（tenantId=null）的已登录用户创建公司并完成初始化。
 * 同时将该用户名下所有游离报销单和费用明细的 tenantId 一并补全。
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, tenants, reimbursements, reimbursementItems } from '@/lib/db/schema';
import { eq, isNull } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 查询当前用户
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!currentUser) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 已有公司则无需操作
    if (currentUser.tenantId) {
      return NextResponse.json({
        success: true,
        message: '您已关联公司，无需重复创建',
        tenantId: currentUser.tenantId,
      });
    }

    // 读取公司名称
    const body = await request.json().catch(() => ({}));
    const companyName: string = (body.companyName || '').trim() || `${currentUser.name}的公司`;

    const slug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-|-$/g, '') || 'company';

    // 1. 创建租户
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: companyName,
        slug: `${slug}-${Date.now()}`,
        plan: 'free',
      })
      .returning();

    // 2. 更新用户 tenantId，并设为 admin（公司创建人）
    await db
      .update(users)
      .set({
        tenantId: tenant.id,
        role: 'admin',
        updatedAt: new Date(),
      })
      .where(eq(users.id, currentUser.id));

    // 3. 将该用户的游离报销单全部关联到新租户
    const orphanReimbs = await db
      .select({ id: reimbursements.id })
      .from(reimbursements)
      .where(eq(reimbursements.userId, currentUser.id));

    if (orphanReimbs.length > 0) {
      const reimbIds = orphanReimbs.map((r) => r.id);

      await db
        .update(reimbursements)
        .set({ tenantId: tenant.id, updatedAt: new Date() })
        .where(eq(reimbursements.userId, currentUser.id));

      // 4. 同步更新对应费用明细（若有 tenantId 字段）——跳过没有该字段的表
      // reimbursementItems 目前不含 tenantId，通过 reimbursementId 关联即可
      // 此处为扩展预留，如未来 items 加了 tenantId 可在此补全
    }

    return NextResponse.json({
      success: true,
      message: `公司「${companyName}」创建成功，已关联 ${orphanReimbs.length} 笔历史报销`,
      tenantId: tenant.id,
      companyName: tenant.name,
      migratedReimbursements: orphanReimbs.length,
    });
  } catch (error) {
    console.error('Create company error:', error);
    return NextResponse.json(
      { error: '创建公司失败，请稍后重试' },
      { status: 500 }
    );
  }
}
