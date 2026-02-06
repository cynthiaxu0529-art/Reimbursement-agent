import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, reimbursementItems, users, tenants } from '@/lib/db/schema';
import { eq, desc, and, or, inArray } from 'drizzle-orm';
import { getUserRoles, canApprove, canProcessPayment, isAdmin } from '@/lib/auth/roles';
import { getVisibleUserIds } from '@/lib/department/department-service';
import { checkItemsLimit } from '@/lib/policy/limit-service';

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
    const myApprovals = searchParams.get('myApprovals') === 'true'; // 只看自己批准的
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');

    // 获取用户实际的数据库角色
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!currentUser) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 获取用户的角色数组（支持多角色）
    const userRoles = getUserRoles(currentUser);

    // 构建查询条件
    const conditions: any[] = [];

    // 验证角色权限并应用部门级数据隔离
    if (role === 'approver' && currentUser.tenantId) {
      // 检查用户是否有审批权限（admin也可以查看和审批）
      if (!canApprove(userRoles) && !isAdmin(userRoles)) {
        return NextResponse.json({ error: '无审批权限' }, { status: 403 });
      }

      // 获取用户可以查看的报销提交人ID列表（部门级数据隔离）
      const visibleUserIds = await getVisibleUserIds(
        session.user.id,
        currentUser.tenantId,
        userRoles
      );

      if (visibleUserIds === null) {
        // Finance/Admin/Super Admin 可以看同租户所有报销
        conditions.push(eq(reimbursements.tenantId, currentUser.tenantId));
      } else if (visibleUserIds.length > 0) {
        // Manager 只能看管理部门（含子部门）的成员报销
        conditions.push(eq(reimbursements.tenantId, currentUser.tenantId));
        conditions.push(inArray(reimbursements.userId, visibleUserIds));
      } else {
        // 没有管理任何部门，只能看自己的
        conditions.push(eq(reimbursements.userId, session.user.id));
      }

      // 如果只看自己处理的（批准或驳回）
      if (myApprovals) {
        conditions.push(or(
          eq(reimbursements.approvedBy, session.user.id),
          eq(reimbursements.rejectedBy, session.user.id)
        ));
      }
    } else if (role === 'finance' && currentUser.tenantId) {
      // 检查用户是否有财务权限
      if (!canProcessPayment(userRoles)) {
        return NextResponse.json({ error: '无财务权限' }, { status: 403 });
      }
      // 财务可以看同租户所有报销（需要处理付款）
      conditions.push(eq(reimbursements.tenantId, currentUser.tenantId));
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

    // 是否需要加载提交人信息（审批人、财务、管理员查看他人报销时需要）
    const isApproverOrFinance = (role === 'approver' && (canApprove(userRoles) || isAdmin(userRoles))) ||
                                 (role === 'finance' && canProcessPayment(userRoles));

    // 查询报销列表
    const list = await db.query.reimbursements.findMany({
      where: and(...conditions),
      orderBy: [desc(reimbursements.createdAt)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      with: {
        items: true,
        user: isApproverOrFinance ? {
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

    // 获取租户本位币
    const tenantRecord = await db.query.tenants.findFirst({
      where: eq(tenants.id, session.user.tenantId),
      columns: { baseCurrency: true },
    });
    const tenantBaseCurrency = tenantRecord?.baseCurrency || 'USD';

    // 验证每项费用的必填字段
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

    // 应用政策限额约束（支持 per_day 和 per_month 类型）
    const limitResult = await checkItemsLimit(
      session.user.id,
      session.user.tenantId,
      items.map((item: any) => ({
        category: item.category,
        amount: parseFloat(item.amount) || 0,
        amountInBaseCurrency: item.amountInBaseCurrency || parseFloat(item.amount) || 0,
        date: item.date,
        location: item.location,
      }))
    );

    // 使用调整后的金额更新 items
    const adjustedItems = items.map((item: any, index: number) => {
      const limitItem = limitResult.items[index];
      // 计算调整后的原币金额（按比例调整）
      const originalUsd = item.amountInBaseCurrency || parseFloat(item.amount) || 0;
      const adjustedUsd = limitItem.adjustedAmount;
      const ratio = originalUsd > 0 ? adjustedUsd / originalUsd : 1;
      const adjustedOriginalAmount = (parseFloat(item.amount) || 0) * ratio;

      return {
        ...item,
        amount: adjustedOriginalAmount,
        amountInBaseCurrency: adjustedUsd,
        originalAmount: parseFloat(item.amount) || 0,
        originalAmountInBaseCurrency: originalUsd,
        wasAdjusted: limitItem.wasAdjusted,
      };
    });

    // 计算原币总金额（使用调整后的金额）
    const totalAmount = adjustedItems.reduce(
      (sum: number, item: any) => sum + (parseFloat(item.amount) || 0),
      0
    );

    // 计算美元总金额（如果前端未提供则使用原币金额）
    const usdTotal = adjustedItems.reduce(
      (sum: number, item: any) => sum + (item.amountInBaseCurrency || parseFloat(item.amount) || 0),
      0
    );

    // 构建报销单数据（不包含 undefined 值）
    const reimbursementData: any = {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      title,
      description: description || null,
      totalAmount,
      totalAmountInBaseCurrency: usdTotal,
      baseCurrency: tenantBaseCurrency,
      status: submitStatus === 'pending' ? 'pending' : 'draft',
      autoCollected: false,
      sourceType: 'manual',
    };

    // 只有当有值时才添加这些字段
    if (tripId) {
      reimbursementData.tripId = tripId;
    }
    if (submitStatus === 'pending') {
      reimbursementData.submittedAt = new Date();
    }

    // 创建报销单
    const [reimbursement] = await db
      .insert(reimbursements)
      .values(reimbursementData)
      .returning();

    // 创建费用明细（使用调整后的金额）
    if (adjustedItems.length > 0) {
      // 解析日期，支持多种格式
      const parseDate = (dateStr: string): Date => {
        if (!dateStr) return new Date();
        // 尝试直接解析 ISO 格式 (YYYY-MM-DD)
        const isoDate = new Date(dateStr);
        if (!isNaN(isoDate.getTime())) return isoDate;
        // 尝试解析 YYYY/MM/DD 格式
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }
        return new Date();
      };

      await db.insert(reimbursementItems).values(
        adjustedItems.map((item: any) => {
          const itemData: any = {
            reimbursementId: reimbursement.id,
            category: item.category,
            description: item.description || item.category || '费用',
            amount: parseFloat(item.amount) || 0,
            currency: item.currency || 'CNY',
            exchangeRate: item.exchangeRate || null,
            amountInBaseCurrency: item.amountInBaseCurrency || parseFloat(item.amount) || 0,
            date: parseDate(item.date),
            location: item.location || null,
            vendor: item.vendor || null,
            receiptUrl: item.receiptUrl || null,
          };
          // Add hotel-specific fields
          if (item.checkInDate) {
            itemData.checkInDate = parseDate(item.checkInDate);
          }
          if (item.checkOutDate) {
            itemData.checkOutDate = parseDate(item.checkOutDate);
          }
          if (item.nights) {
            itemData.nights = item.nights;
          }
          return itemData;
        })
      );
    }

    // 构建返回数据，包含限额调整信息
    const responseData: any = {
      success: true,
      data: reimbursement,
    };

    // 如果有金额被调整，返回提示信息
    if (limitResult.totalAdjusted > 0) {
      responseData.limitAdjustments = {
        count: limitResult.totalAdjusted,
        messages: limitResult.messages,
        message: `有 ${limitResult.totalAdjusted} 项费用超过政策限额，已自动调整`,
      };
    }

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error('Create reimbursement error:', error);
    // 返回详细的错误信息以便调试
    return NextResponse.json(
      {
        error: `创建失败: ${error?.message || '未知错误'}`,
        detail: error?.detail || error?.code || null
      },
      { status: 500 }
    );
  }
}
