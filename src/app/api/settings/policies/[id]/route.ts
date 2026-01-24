import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { policies, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * GET /api/settings/policies/[id] - 获取单个政策
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '未关联公司' }, { status: 404 });
    }

    const policy = await db.query.policies.findFirst({
      where: and(eq(policies.id, id), eq(policies.tenantId, user.tenantId)),
    });

    if (!policy) {
      return NextResponse.json({ error: '政策不存在' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: policy,
    });
  } catch (error) {
    console.error('Get policy error:', error);
    return NextResponse.json({ error: '获取政策失败' }, { status: 500 });
  }
}

/**
 * PUT /api/settings/policies/[id] - 更新政策
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '未关联公司' }, { status: 404 });
    }

    // 检查权限
    if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'finance') {
      return NextResponse.json({ error: '无权限修改政策' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, isActive, priority, rules } = body;

    const [updated] = await db
      .update(policies)
      .set({
        name: name ?? undefined,
        description: description ?? undefined,
        isActive: isActive ?? undefined,
        priority: priority ?? undefined,
        rules: rules ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(policies.id, id), eq(policies.tenantId, user.tenantId)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: '政策不存在' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Update policy error:', error);
    return NextResponse.json({ error: '更新政策失败' }, { status: 500 });
  }
}

/**
 * DELETE /api/settings/policies/[id] - 删除政策
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '未关联公司' }, { status: 404 });
    }

    // 检查权限
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: '无权限删除政策' }, { status: 403 });
    }

    const [deleted] = await db
      .delete(policies)
      .where(and(eq(policies.id, id), eq(policies.tenantId, user.tenantId)))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: '政策不存在' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: '政策已删除',
    });
  } catch (error) {
    console.error('Delete policy error:', error);
    return NextResponse.json({ error: '删除政策失败' }, { status: 500 });
  }
}
