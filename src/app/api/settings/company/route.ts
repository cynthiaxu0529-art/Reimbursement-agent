import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tenants, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/settings/company - 获取公司设置
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 获取用户的租户信息
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '未关联公司' }, { status: 404 });
    }

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, user.tenantId),
    });

    if (!tenant) {
      return NextResponse.json({ error: '公司不存在' }, { status: 404 });
    }

    const settings = (tenant.settings || {}) as any;

    return NextResponse.json({
      success: true,
      data: {
        name: tenant.name,
        currency: tenant.baseCurrency,
        autoApproveLimit: settings.autoApproveLimit || 0,
        departments: settings.departments || ['技术部', '产品部', '运营部', '财务部', '人力资源部', '市场部'],
      },
    });
  } catch (error) {
    console.error('Get company error:', error);
    return NextResponse.json({ error: '获取公司设置失败' }, { status: 500 });
  }
}

/**
 * PUT /api/settings/company - 更新公司设置
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 获取用户
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '未关联公司' }, { status: 404 });
    }

    // 检查权限 - 只有管理员可以修改公司设置
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: '无权限修改公司设置' }, { status: 403 });
    }

    const body = await request.json();
    const { name, currency, autoApproveLimit, departments } = body;

    // 获取当前设置
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, user.tenantId),
    });

    const currentSettings = (tenant?.settings || {}) as any;

    const [updated] = await db
      .update(tenants)
      .set({
        name: name || undefined,
        baseCurrency: currency || undefined,
        settings: {
          ...currentSettings,
          autoApproveLimit: autoApproveLimit ?? currentSettings.autoApproveLimit,
          departments: departments || currentSettings.departments,
        },
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, user.tenantId))
      .returning();

    const updatedSettings = (updated.settings || {}) as any;

    return NextResponse.json({
      success: true,
      data: {
        name: updated.name,
        currency: updated.baseCurrency,
        autoApproveLimit: updatedSettings.autoApproveLimit || 0,
        departments: updatedSettings.departments || [],
      },
    });
  } catch (error) {
    console.error('Update company error:', error);
    return NextResponse.json({ error: '更新公司设置失败' }, { status: 500 });
  }
}
