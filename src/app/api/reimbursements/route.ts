import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, reimbursementItems } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';

// 强制动态渲染，避免构建时预渲染
export const dynamic = 'force-dynamic';

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
    const role = searchParams.get('role'); // 'approver' 查看待审批的
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');

    // 构建查询条件
    let conditions: any[] = [];

    if (role === 'approver' && session.user.tenantId) {
      // 审批人模式：查看同租户的报销（排除自己的）
      conditions.push(eq(reimbursements.tenantId, session.user.tenantId));
    } else {
      // 员工模式：只看自己的
      conditions.push(eq(reimbursements.userId, session.user.id));
    }

    // 支持多个状态（逗号分隔）
    if (status) {
      const statuses = status.split(',').map(s => s.trim());
      if (statuses.length === 1) {
        conditions.push(eq(reimbursements.status, statuses[0] as any));
      } else {
        // 多个状态用 inArray
        const { inArray } = await import('drizzle-orm');
        conditions.push(inArray(reimbursements.status, statuses as any[]));
      }
    }

    // 查询报销列表
    const list = await db.query.reimbursements.findMany({
      where: and(...conditions),
      orderBy: [desc(reimbursements.createdAt)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      with: {
        items: true,
        user: role === 'approver' ? {
          columns: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            department: true,
          },
        } : undefined,
      },
    });

    // Transform data to include submitter info for approver mode
    const transformedList = list.map((item: any) => ({
      ...item,
      submitter: item.user ? {
        name: item.user.name,
        email: item.user.email,
        avatar: item.user.avatar,
        department: item.user.department,
      } : undefined,
      user: undefined, // Remove the raw user object
    }));

    return NextResponse.json({
      success: true,
      data: transformedList,
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
    const { title, description, tripId, items, status: submitStatus, totalAmountInBaseCurrency } = body;

    if (!title || !items || items.length === 0) {
      return NextResponse.json(
        { error: '请填写标题和至少一项费用' },
        { status: 400 }
      );
    }

    // 检查用户是否有公司
    if (!session.user.tenantId) {
      return NextResponse.json(
        { error: '请先在设置中创建或加入公司，才能提交报销' },
        { status: 400 }
      );
    }

    // 验证费用项数据
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.category) {
        return NextResponse.json(
          { error: `第 ${i + 1} 项费用缺少类别` },
          { status: 400 }
        );
      }
      if (!item.amount || isNaN(parseFloat(item.amount))) {
        return NextResponse.json(
          { error: `第 ${i + 1} 项费用金额无效` },
          { status: 400 }
        );
      }
      if (!item.date) {
        return NextResponse.json(
          { error: `第 ${i + 1} 项费用缺少日期` },
          { status: 400 }
        );
      }
    }

    // 计算原币总金额
    const totalAmount = items.reduce(
      (sum: number, item: any) => sum + (parseFloat(item.amount) || 0),
      0
    );

    // 计算美元总金额（如果前端未提供则使用原币金额）
    const usdTotal = totalAmountInBaseCurrency || items.reduce(
      (sum: number, item: any) => sum + (item.amountInBaseCurrency || parseFloat(item.amount) || 0),
      0
    );

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
        totalAmountInBaseCurrency: usdTotal,
        baseCurrency: 'USD',
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
          amountInBaseCurrency: item.amountInBaseCurrency || parseFloat(item.amount) || 0,
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
    // 提供更详细的错误信息
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json(
      { error: `创建报销单失败: ${errorMessage}` },
      { status: 500 }
    );
  }
}
