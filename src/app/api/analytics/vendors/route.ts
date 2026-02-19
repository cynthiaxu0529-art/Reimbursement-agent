/**
 * 供应商费用统计 API
 * 提供按供应商维度的费用分析
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, reimbursements, reimbursementItems } from '@/lib/db/schema';
import { eq, and, gte, lte, inArray, isNotNull } from 'drizzle-orm';

// 供应商分类
const VENDOR_CATEGORIES = {
  ai_providers: {
    label: 'AI 服务商',
    keywords: ['openai', 'anthropic', 'claude', 'azure openai', 'cursor', 'copilot', 'midjourney', 'stability'],
  },
  cloud_providers: {
    label: '云服务商',
    keywords: ['aws', 'amazon', 'gcp', 'google cloud', 'azure', '阿里云', 'aliyun', '腾讯云', '华为云', 'digitalocean'],
  },
  productivity: {
    label: '协作工具',
    keywords: ['notion', 'slack', 'zoom', 'lark', '飞书', 'dingtalk', '钉钉', 'figma', 'miro', 'asana', 'monday'],
  },
  dev_tools: {
    label: '开发工具',
    keywords: ['github', 'gitlab', 'jira', 'confluence', 'atlassian', 'linear', 'vercel', 'netlify', 'postman'],
  },
  infrastructure: {
    label: '基础设施',
    keywords: ['cloudflare', 'datadog', 'newrelic', 'sentry', 'pagerduty', 'mongodb', 'redis'],
  },
  other: {
    label: '其他',
    keywords: [],
  },
};

// 识别供应商类别
function categorizeVendor(vendorName: string): string {
  const lowerName = vendorName.toLowerCase();
  for (const [category, config] of Object.entries(VENDOR_CATEGORIES)) {
    if (config.keywords.some(keyword => lowerName.includes(keyword))) {
      return category;
    }
  }
  return 'other';
}

/**
 * GET /api/analytics/vendors
 * 获取供应商费用统计
 *
 * Query params:
 * - period: 时间范围 (month, quarter, year)
 * - category: 供应商类别过滤
 * - limit: 返回数量限制
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

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'month';
    const categoryFilter = searchParams.get('category');
    const limit = parseInt(searchParams.get('limit') || '50');

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
      case 'month':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    // 查询有供应商信息的费用明细
    const conditions = [
      eq(reimbursements.tenantId, user.tenantId),
      gte(reimbursementItems.date, startDate),
      lte(reimbursementItems.date, endDate),
      isNotNull(reimbursementItems.vendor),
      inArray(reimbursements.status, ['approved', 'paid']),
    ];

    const expenses = await db
      .select({
        vendor: reimbursementItems.vendor,
        category: reimbursementItems.category,
        amount: reimbursementItems.amountInBaseCurrency,
        date: reimbursementItems.date,
        userId: reimbursements.userId,
      })
      .from(reimbursementItems)
      .innerJoin(reimbursements, eq(reimbursementItems.reimbursementId, reimbursements.id))
      .where(and(...conditions));

    // 按供应商聚合
    const vendorStats: Record<string, {
      name: string;
      category: string;
      expenseCategory: string;
      totalAmount: number;
      transactionCount: number;
      users: Set<string>;
      firstSeen: Date;
      lastSeen: Date;
      monthlyAmounts: Record<string, number>;
    }> = {};

    expenses.forEach(expense => {
      const vendorName = expense.vendor || '未知';
      const normalizedName = vendorName.trim();

      if (!vendorStats[normalizedName]) {
        vendorStats[normalizedName] = {
          name: normalizedName,
          category: categorizeVendor(normalizedName),
          expenseCategory: expense.category,
          totalAmount: 0,
          transactionCount: 0,
          users: new Set(),
          firstSeen: expense.date,
          lastSeen: expense.date,
          monthlyAmounts: {},
        };
      }

      const stats = vendorStats[normalizedName];
      stats.totalAmount += expense.amount;
      stats.transactionCount += 1;
      stats.users.add(expense.userId);

      if (expense.date < stats.firstSeen) stats.firstSeen = expense.date;
      if (expense.date > stats.lastSeen) stats.lastSeen = expense.date;

      const monthKey = `${expense.date.getFullYear()}-${String(expense.date.getMonth() + 1).padStart(2, '0')}`;
      stats.monthlyAmounts[monthKey] = (stats.monthlyAmounts[monthKey] || 0) + expense.amount;
    });

    // 转换为数组并排序
    let vendorList = Object.values(vendorStats)
      .map(v => ({
        name: v.name,
        category: v.category,
        categoryLabel: VENDOR_CATEGORIES[v.category as keyof typeof VENDOR_CATEGORIES]?.label || '其他',
        expenseCategory: v.expenseCategory,
        totalAmount: Math.round(v.totalAmount * 100) / 100,
        transactionCount: v.transactionCount,
        userCount: v.users.size,
        avgPerTransaction: Math.round((v.totalAmount / v.transactionCount) * 100) / 100,
        firstSeen: v.firstSeen.toISOString(),
        lastSeen: v.lastSeen.toISOString(),
        monthlyTrend: Object.entries(v.monthlyAmounts)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([month, amount]) => ({ month, amount: Math.round(amount * 100) / 100 })),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    // 按类别过滤
    if (categoryFilter && categoryFilter !== 'all') {
      vendorList = vendorList.filter(v => v.category === categoryFilter);
    }

    // 限制返回数量
    vendorList = vendorList.slice(0, limit);

    // 按类别分组统计
    const categoryStats = Object.entries(VENDOR_CATEGORIES).map(([key, config]) => {
      const vendors = Object.values(vendorStats).filter(v => v.category === key);
      const total = vendors.reduce((sum, v) => sum + v.totalAmount, 0);
      return {
        category: key,
        label: config.label,
        totalAmount: Math.round(total * 100) / 100,
        vendorCount: vendors.length,
        transactionCount: vendors.reduce((sum, v) => sum + v.transactionCount, 0),
      };
    }).filter(c => c.vendorCount > 0);

    // 计算总计
    const totalAmount = Object.values(vendorStats).reduce((sum, v) => sum + v.totalAmount, 0);

    // 识别可能的重复订阅（同一供应商多个用户付费）
    const potentialDuplicates = Object.values(vendorStats)
      .filter(v => v.users.size > 1 && v.totalAmount > 100)
      .map(v => ({
        name: v.name,
        userCount: v.users.size,
        totalAmount: Math.round(v.totalAmount * 100) / 100,
        suggestion: `${v.name} 有 ${v.users.size} 人分别报销，考虑合并为团队订阅可能更划算`,
      }));

    return NextResponse.json({
      success: true,
      data: {
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          label: period,
        },
        summary: {
          totalAmount: Math.round(totalAmount * 100) / 100,
          currency: 'CNY',
          vendorCount: Object.keys(vendorStats).length,
          transactionCount: expenses.length,
        },
        byCategory: categoryStats,
        vendors: vendorList,
        insights: {
          potentialDuplicates,
          topSpending: vendorList.slice(0, 5).map(v => ({
            name: v.name,
            amount: v.totalAmount,
            percentage: Math.round((v.totalAmount / totalAmount) * 1000) / 10,
          })),
        },
        availableCategories: Object.entries(VENDOR_CATEGORIES).map(([key, config]) => ({
          value: key,
          label: config.label,
        })),
      },
    });
  } catch (error) {
    console.error('Vendor analysis error:', error);
    return NextResponse.json({ error: '获取供应商分析失败' }, { status: 500 });
  }
}
