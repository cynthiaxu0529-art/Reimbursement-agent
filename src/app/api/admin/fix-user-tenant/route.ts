import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, tenants, reimbursements, reimbursementItems, receipts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// 此 API 用于修复未关联公司的邀请用户
// 使用方法:
// DELETE /api/admin/fix-user-tenant?email=xxx@example.com - 删除用户以便重新注册
// POST /api/admin/fix-user-tenant { email, tenantId } - 将用户关联到公司

export async function DELETE(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: '请提供邮箱地址' }, { status: 400 });
    }

    // 查找用户
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 先删除用户的报销明细（通过报销单关联）
    const userReimbursements = await db.query.reimbursements.findMany({
      where: eq(reimbursements.userId, user.id),
    });

    for (const reimbursement of userReimbursements) {
      // 删除报销明细
      await db.delete(reimbursementItems).where(eq(reimbursementItems.reimbursementId, reimbursement.id));
    }

    // 删除用户的报销单
    await db.delete(reimbursements).where(eq(reimbursements.userId, user.id));

    // 删除用户的票据
    await db.delete(receipts).where(eq(receipts.userId, user.id));

    // 最后删除用户
    await db.delete(users).where(eq(users.email, email));

    return NextResponse.json({
      success: true,
      message: `已删除用户 ${email} 及其 ${userReimbursements.length} 条报销记录，现在可以重新通过邀请链接注册`
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: '删除失败: ' + (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email, tenantId } = await request.json();

    if (!email) {
      return NextResponse.json({ error: '请提供邮箱地址' }, { status: 400 });
    }

    // 查找用户
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    if (user.tenantId) {
      return NextResponse.json({
        error: '用户已关联公司',
        currentTenantId: user.tenantId
      }, { status: 400 });
    }

    // 如果没有提供 tenantId，列出所有可用的公司
    if (!tenantId) {
      const allTenants = await db.select().from(tenants);
      return NextResponse.json({
        message: '请提供要关联的公司 ID',
        availableTenants: allTenants.map(t => ({ id: t.id, name: t.name })),
        user: { id: user.id, email: user.email, name: user.name }
      });
    }

    // 验证 tenant 存在
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    });

    if (!tenant) {
      return NextResponse.json({ error: '公司不存在' }, { status: 404 });
    }

    // 更新用户的 tenantId
    await db.update(users)
      .set({ tenantId })
      .where(eq(users.email, email));

    return NextResponse.json({
      success: true,
      message: `已将用户 ${email} 关联到公司 ${tenant.name}`
    });
  } catch (error) {
    console.error('Fix user tenant error:', error);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get('email');

    if (!email) {
      // 列出所有没有关联公司的用户
      const unassociatedUsers = await db.query.users.findMany({
        where: eq(users.tenantId, null as unknown as string),
      });

      const allTenants = await db.select().from(tenants);

      return NextResponse.json({
        unassociatedUsers: unassociatedUsers.map(u => ({
          id: u.id,
          email: u.email,
          name: u.name
        })),
        availableTenants: allTenants.map(t => ({ id: t.id, name: t.name }))
      });
    }

    // 查找特定用户
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenantId,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json({ error: '查询失败' }, { status: 500 });
  }
}
