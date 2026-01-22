import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, reimbursementItems } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';

/**
 * GET /api/reimbursements - 获取报销列表
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');

    // 构建查询条件
    const conditions = [eq(reimbursements.userId, session.user.id)];
    if (status) {
      conditions.push(eq(reimbursements.status, status as any));
    }

    // 查询报销列表
    const list = await db.query.reimbursements.findMany({
      where: and(...conditions),
      orderBy: [desc(reimbursements.createdAt)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      with: {
        items: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: list,
      meta: { page, pageSize },
    });
  } catch (error) {
    console.error('Get reimbursements error:', error);
    return NextResponse.json(
      { error: '获取报销列表失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reimbursements - 创建报销单
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, tripId, items, status: submitStatus } = body;

    if (!title || !items || items.length === 0) {
      return NextResponse.json(
        { error: '请填写标题和至少一项费用' },
        { status: 400 }
      );
    }

    // 计算总金额
    const totalAmount = items.reduce(
      (sum: number, item: any) => sum + (parseFloat(item.amount) || 0),
      0
    );

    // 检查用户是否有租户
    if (!session.user.tenantId) {
      return NextResponse.json(
        { error: '请先创建或加入公司' },
        { status: 400 }
      );
    }

    // 创建报销单
    const [reimbursement] = await db
      .insert(reimbursements)
      .values({
        tenantId: session.user.tenantId,
        userId: session.user.id,
        tripId: tripId || undefined,
        title,
        description,
        totalAmount,
        totalAmountInBaseCurrency: totalAmount, // TODO: 货币转换
        baseCurrency: 'CNY',
        status: submitStatus === 'pending' ? 'pending' : 'draft',
        autoCollected: false,
        sourceType: 'manual',
        submittedAt: submitStatus === 'pending' ? new Date() : undefined,
      })
      .returning();

    // 创建费用明细
    if (items.length > 0) {
      await db.insert(reimbursementItems).values(
        items.map((item: any) => ({
          reimbursementId: reimbursement.id,
          category: item.category,
          description: item.description || '',
          amount: parseFloat(item.amount) || 0,
          currency: item.currency || 'CNY',
          amountInBaseCurrency: parseFloat(item.amount) || 0,
          date: new Date(item.date),
          location: item.location || null,
          vendor: item.vendor || null,
          receiptUrl: item.receiptUrl || null,
        }))
      );
    }

    return NextResponse.json({
      success: true,
      data: reimbursement,
    });
  } catch (error) {
    console.error('Create reimbursement error:', error);
    return NextResponse.json(
      { error: '创建报销单失败' },
      { status: 500 }
    );
  }
}
