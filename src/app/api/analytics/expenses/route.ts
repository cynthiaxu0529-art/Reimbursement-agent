/**
 * 通用费用分析 API
 * 支持所有报销类别的聚合分析
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, reimbursements, reimbursementItems, tenants } from '@/lib/db/schema';
import { eq, and, gte, lte, inArray, sql, desc } from 'drizzle-orm';
import { getUserRoles, isAdmin, canApprove, canProcessPayment } from '@/lib/auth/roles';
import { getVisibleUserIds } from '@/lib/department/department-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 所有费用类别
const ALL_CATEGORIES = [
  'flight',
  'train',
  'hotel',
  'meal',
  'taxi',
  'office_supplies',
  'ai_token',
  'cloud_resource',
  'api_service',
  'software',
  'hosting',
  'domain',
  'client_entertainment',
  'other',
];

// 类别中文名称
const CATEGORY_LABELS: Record<string, string> = {
  flight: '机票',
  train: '火车票',
  hotel: '酒店住宿',
  meal: '餐饮',
  taxi: '交通',
  office_supplies: '办公用品',
  ai_token: 'AI 服务',
  cloud_resource: '云资源',
  api_service: 'API 服务',
  software: '软件订阅',
  hosting: '托管服务',
  domain: '域名',
  client_entertainment: '客户招待',
  other: '其他',
};

/**
 * GET /api/analytics/expenses
 * 获取通用费用分析数据
 *
 * Query params:
 * - period: 时间范围 (month, quarter, year, custom, all)
 * - startDate: 自定义开始日期
 * - endDate: 自定义结束日期
 * - months: 要分析的月份数（从当前往前推，默认3个月）
 * - scope: 范围 (personal, team, company)
 * - status: 报销状态筛选 (all, pending, approved, paid)
 * - internalUserId: 内部认证用户ID（工具调用时使用）
 * - internalTenantId: 内部认证租户ID（工具调用时使用）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 支持两种认证方式
    const internalUserId = searchParams.get('internalUserId');
    const internalTenantId = searchParams.get('internalTenantId');

    console.log('[Expenses API] Request:', {
      hasInternalAuth: !!(internalUserId && internalTenantId),
      params: Object.fromEntries(searchParams.entries()),
    });

    let user: any;
    let userId: string;

    if (internalUserId && internalTenantId) {
      // 内部调用（来自 AI 工具执行器）
      user = await db.query.users.findFirst({
        where: eq(users.id, internalUserId),
      });

      if (!user || user.tenantId !== internalTenantId) {
        return NextResponse.json({ error: '内部认证失败' }, { status: 403 });
      }

      userId = internalUserId;
    } else {
      // 正常的 session 认证
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: '未登录' }, { status: 401 });
      }

      user = await db.query.users.findFirst({
        where: eq(users.id, session.user.id),
      });

      if (!user?.tenantId) {
        return NextResponse.json({ error: '未关联公司' }, { status: 404 });
      }

      userId = session.user.id;
    }

    // 获取租户本位币
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, user.tenantId),
      columns: { baseCurrency: true },
    });
    const baseCurrency = tenant?.baseCurrency || 'USD';

    // 解析参数
    const period = searchParams.get('period') || 'month';
    const scope = searchParams.get('scope') || 'company';
    const statusFilter = searchParams.get('status') || 'all';
    const monthsParam = parseInt(searchParams.get('months') || '3');

    // 计算时间范围
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    switch (period) {
      case 'quarter':
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'custom':
        startDate = searchParams.get('startDate')
          ? new Date(searchParams.get('startDate')!)
          : new Date(now.getFullYear(), now.getMonth() - monthsParam, 1);
        endDate = searchParams.get('endDate')
          ? new Date(searchParams.get('endDate')!)
          : now;
        break;
      case 'all':
        // 查询所有数据，不限制时间
        startDate = new Date(2020, 0, 1);
        break;
      case 'month':
      default:
        // 默认查询最近N个月
        startDate = new Date(now.getFullYear(), now.getMonth() - monthsParam + 1, 1);
        break;
    }

    // 构建基础查询条件
    const conditions: any[] = [
      eq(reimbursements.tenantId, user.tenantId),
    ];

    // 状态筛选
    if (statusFilter === 'pending') {
      conditions.push(inArray(reimbursements.status, ['pending', 'under_review']));
    } else if (statusFilter === 'approved') {
      conditions.push(inArray(reimbursements.status, ['approved', 'processing']));
    } else if (statusFilter === 'paid') {
      conditions.push(eq(reimbursements.status, 'paid'));
    } else {
      // all - 排除草稿和已取消
      conditions.push(inArray(reimbursements.status, ['pending', 'under_review', 'approved', 'processing', 'paid']));
    }

    // 权限过滤
    const userRoles = getUserRoles(user);
    if (scope === 'personal') {
      conditions.push(eq(reimbursements.userId, userId));
    } else if (scope === 'team' || scope === 'company') {
      // 检查用户是否有权限查看团队/公司数据
      if (!isAdmin(userRoles) && !canApprove(userRoles) && !canProcessPayment(userRoles)) {
        // 普通员工只能看自己的
        conditions.push(eq(reimbursements.userId, userId));
      } else {
        // 使用部门级数据隔离
        const visibleUserIds = await getVisibleUserIds(userId, user.tenantId, userRoles);
        if (visibleUserIds !== null && visibleUserIds.length > 0) {
          conditions.push(inArray(reimbursements.userId, visibleUserIds));
        } else if (visibleUserIds !== null && visibleUserIds.length === 0) {
          conditions.push(eq(reimbursements.userId, userId));
        }
        // null means no restriction (admin/finance)
      }
    }

    // 查询报销单（带时间筛选）
    const reimbursementList = await db
      .select({
        id: reimbursements.id,
        userId: reimbursements.userId,
        title: reimbursements.title,
        status: reimbursements.status,
        totalAmount: reimbursements.totalAmount,
        totalAmountInBaseCurrency: reimbursements.totalAmountInBaseCurrency,
        baseCurrency: reimbursements.baseCurrency,
        submittedAt: reimbursements.submittedAt,
        approvedAt: reimbursements.approvedAt,
        paidAt: reimbursements.paidAt,
        createdAt: reimbursements.createdAt,
      })
      .from(reimbursements)
      .where(and(...conditions, gte(reimbursements.createdAt, startDate), lte(reimbursements.createdAt, endDate)))
      .orderBy(desc(reimbursements.createdAt))
      .limit(1000);

    // 获取报销明细
    const reimbursementIds = reimbursementList.map(r => r.id);
    let items: any[] = [];

    if (reimbursementIds.length > 0) {
      items = await db
        .select({
          id: reimbursementItems.id,
          reimbursementId: reimbursementItems.reimbursementId,
          category: reimbursementItems.category,
          description: reimbursementItems.description,
          amount: reimbursementItems.amount,
          currency: reimbursementItems.currency,
          amountInBaseCurrency: reimbursementItems.amountInBaseCurrency,
          vendor: reimbursementItems.vendor,
          date: reimbursementItems.date,
        })
        .from(reimbursementItems)
        .where(inArray(reimbursementItems.reimbursementId, reimbursementIds));
    }

    // 获取用户信息
    const userIds = [...new Set(reimbursementList.map(r => r.userId))];
    const userMap = new Map<string, string>();

    if (userIds.length > 0) {
      const usersData = await db.query.users.findMany({
        where: inArray(users.id, userIds),
        columns: { id: true, name: true },
      });
      usersData.forEach(u => userMap.set(u.id, u.name));
    }

    // 聚合统计
    const byCategory: Record<string, { total: number; count: number }> = {};
    const byMonth: Record<string, { total: number; count: number }> = {};
    const byStatus: Record<string, { total: number; count: number }> = {};
    const byUser: Record<string, { name: string; total: number; count: number }> = {};
    const byVendor: Record<string, { total: number; count: number }> = {};

    let totalAmount = 0;
    let totalCount = reimbursementList.length;

    // 按报销单统计
    for (const r of reimbursementList) {
      const amount = r.totalAmountInBaseCurrency || 0;
      totalAmount += amount;

      // 按状态
      if (!byStatus[r.status]) {
        byStatus[r.status] = { total: 0, count: 0 };
      }
      byStatus[r.status].total += amount;
      byStatus[r.status].count += 1;

      // 按用户
      if (!byUser[r.userId]) {
        byUser[r.userId] = { name: userMap.get(r.userId) || '未知', total: 0, count: 0 };
      }
      byUser[r.userId].total += amount;
      byUser[r.userId].count += 1;

      // 按月份
      const monthKey = r.createdAt
        ? `${r.createdAt.getFullYear()}-${String(r.createdAt.getMonth() + 1).padStart(2, '0')}`
        : 'unknown';
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = { total: 0, count: 0 };
      }
      byMonth[monthKey].total += amount;
      byMonth[monthKey].count += 1;
    }

    // 按明细统计
    for (const item of items) {
      const amount = item.amountInBaseCurrency || 0;

      // 按类别
      const category = item.category || 'other';
      if (!byCategory[category]) {
        byCategory[category] = { total: 0, count: 0 };
      }
      byCategory[category].total += amount;
      byCategory[category].count += 1;

      // 按供应商
      const vendor = item.vendor || '未知供应商';
      if (!byVendor[vendor]) {
        byVendor[vendor] = { total: 0, count: 0 };
      }
      byVendor[vendor].total += amount;
      byVendor[vendor].count += 1;
    }

    // 格式化类别数据
    const categoryData = Object.entries(byCategory)
      .map(([key, value]) => ({
        category: key,
        label: CATEGORY_LABELS[key] || key,
        total: Math.round(value.total * 100) / 100,
        count: value.count,
        percentage: totalAmount > 0 ? Math.round((value.total / totalAmount) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // 格式化月度趋势
    const monthlyTrend = Object.entries(byMonth)
      .map(([month, value]) => ({
        month,
        total: Math.round(value.total * 100) / 100,
        count: value.count,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // 格式化状态分布
    const statusLabels: Record<string, string> = {
      pending: '待审批',
      under_review: '审核中',
      approved: '已批准',
      processing: '处理中',
      paid: '已支付',
      rejected: '已拒绝',
    };

    const statusData = Object.entries(byStatus)
      .map(([status, value]) => ({
        status,
        label: statusLabels[status] || status,
        total: Math.round(value.total * 100) / 100,
        count: value.count,
      }))
      .sort((a, b) => b.count - a.count);

    // 格式化用户排行
    const userRanking = Object.entries(byUser)
      .map(([userId, data]) => ({
        userId,
        name: data.name,
        total: Math.round(data.total * 100) / 100,
        count: data.count,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // 格式化供应商排行
    const vendorRanking = Object.entries(byVendor)
      .map(([vendor, value]) => ({
        vendor,
        total: Math.round(value.total * 100) / 100,
        count: value.count,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // 计算环比（与上一个时间段对比）
    const periodDuration = endDate.getTime() - startDate.getTime();
    const prevStartDate = new Date(startDate.getTime() - periodDuration);
    const prevEndDate = new Date(startDate.getTime() - 1);

    const prevConditions = [
      eq(reimbursements.tenantId, user.tenantId),
      inArray(reimbursements.status, ['pending', 'under_review', 'approved', 'processing', 'paid']),
      gte(reimbursements.createdAt, prevStartDate),
      lte(reimbursements.createdAt, prevEndDate),
    ];

    // 添加相同的权限过滤
    if (scope === 'personal') {
      prevConditions.push(eq(reimbursements.userId, userId));
    }

    const prevResult = await db
      .select({
        totalAmount: sql<number>`coalesce(sum(${reimbursements.totalAmountInBaseCurrency}), 0)::real`,
        count: sql<number>`count(*)::int`,
      })
      .from(reimbursements)
      .where(and(...prevConditions));

    const prevTotalAmount = prevResult[0]?.totalAmount || 0;
    const prevCount = prevResult[0]?.count || 0;

    const growthRate = prevTotalAmount > 0
      ? Math.round(((totalAmount - prevTotalAmount) / prevTotalAmount) * 1000) / 10
      : (totalAmount > 0 ? 100 : 0);

    const countGrowthRate = prevCount > 0
      ? Math.round(((totalCount - prevCount) / prevCount) * 1000) / 10
      : (totalCount > 0 ? 100 : 0);

    return NextResponse.json({
      success: true,
      data: {
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          label: period,
        },
        scope,
        summary: {
          totalAmount: Math.round(totalAmount * 100) / 100,
          totalCount,
          currency: baseCurrency,
          averageAmount: totalCount > 0 ? Math.round((totalAmount / totalCount) * 100) / 100 : 0,
          categoryCount: categoryData.filter(c => c.count > 0).length,
          vendorCount: Object.keys(byVendor).length,
        },
        comparison: {
          previousPeriod: {
            totalAmount: Math.round(prevTotalAmount * 100) / 100,
            totalCount: prevCount,
          },
          growth: {
            amountRate: growthRate,
            countRate: countGrowthRate,
            amountDiff: Math.round((totalAmount - prevTotalAmount) * 100) / 100,
            countDiff: totalCount - prevCount,
          },
        },
        byCategory: categoryData,
        byStatus: statusData,
        monthlyTrend,
        userRanking: scope !== 'personal' ? userRanking : undefined,
        vendorRanking,
        // 提供最近的报销单列表（用于AI分析）
        recentReimbursements: reimbursementList.slice(0, 20).map(r => ({
          id: r.id,
          title: r.title,
          status: r.status,
          amount: Math.round((r.totalAmountInBaseCurrency || 0) * 100) / 100,
          currency: baseCurrency,
          submitter: userMap.get(r.userId) || '未知',
          createdAt: r.createdAt?.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error('[Expenses API] Error:', error);
    return NextResponse.json({ error: '获取费用分析失败' }, { status: 500 });
  }
}
