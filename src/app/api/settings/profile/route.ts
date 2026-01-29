import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// 标记为动态路由，避免构建时静态渲染错误
export const dynamic = 'force-dynamic';

/**
 * GET /api/settings/profile - 获取用户资料
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        walletAddress: (user.bankAccount as any)?.walletAddress || '',
        phone: (user.bankAccount as any)?.phone || '',
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json({ error: '获取资料失败' }, { status: 500 });
  }
}

/**
 * PUT /api/settings/profile - 更新用户资料
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { name, department, walletAddress, phone } = body;

    const [updated] = await db
      .update(users)
      .set({
        name: name || undefined,
        department: department || undefined,
        bankAccount: {
          walletAddress: walletAddress || '',
          phone: phone || '',
        },
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.user.id))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        name: updated.name,
        email: updated.email,
        department: updated.department,
        walletAddress: (updated.bankAccount as any)?.walletAddress || '',
        phone: (updated.bankAccount as any)?.phone || '',
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: '更新资料失败' }, { status: 500 });
  }
}
