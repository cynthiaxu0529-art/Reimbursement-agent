import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { advances, users } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

/**
 * GET /api/advances - 获取预借款列表
 * 员工看自己的，财务/管理员看所有的
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '未关联公司' }, { status: 404 });
    }

    const isFinanceOrAdmin = user.role === 'admin' || user.role === 'super_admin' || user.role === 'finance';
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let conditions = [eq(advances.tenantId, user.tenantId)];

    // 非财务/管理员只能看自己的
    if (!isFinanceOrAdmin) {
      conditions.push(eq(advances.userId, user.id));
    }

    if (status) {
      conditions.push(eq(advances.status, status));
    }

    const advanceList = await db.query.advances.findMany({
      where: and(...conditions),
      orderBy: [desc(advances.createdAt)],
      with: {
        user: true,
        reconciliations: {
          with: {
            reimbursement: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: advanceList.map(a => ({
        ...a,
        user: a.user ? { id: a.user.id, name: a.user.name, email: a.user.email, department: a.user.department } : null,
      })),
    });
  } catch (error) {
    console.error('Get advances error:', error);
    return NextResponse.json({ error: '获取预借款列表失败' }, { status: 500 });
  }
}

/**
 * POST /api/advances - 创建预借款申请
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '未关联公司' }, { status: 404 });
    }

    const body = await request.json();
    const { title, description, purpose, amount, currency } = body;

    if (!title || !amount || amount <= 0) {
      return NextResponse.json({ error: '请填写标题和有效金额' }, { status: 400 });
    }

    const newAdvance = await db.insert(advances).values({
      id: uuid(),
      tenantId: user.tenantId,
      userId: user.id,
      title,
      description: description || '',
      purpose: purpose || '',
      amount,
      currency: currency || 'USD',
      status: 'pending',
    }).returning();

    return NextResponse.json({
      success: true,
      data: newAdvance[0],
    });
  } catch (error) {
    console.error('Create advance error:', error);
    return NextResponse.json({ error: '创建预借款申请失败' }, { status: 500 });
  }
}
