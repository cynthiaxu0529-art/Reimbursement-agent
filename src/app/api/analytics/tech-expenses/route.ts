/**
 * 技术费用分析 API
 * 提供 SaaS 订阅、AI Token、云资源等技术费用的聚合分析
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, reimbursements, reimbursementItems, tenants } from '@/lib/db/schema';
import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm';

// 技术费用类别
const TECH_CATEGORIES = [
  'ai_token',
  'cloud_resource',
  'api_service',
  'software',
  'hosting',
  'domain',
];

// 类别中文名称
const CATEGORY_LABELS: Record<string, string> = {
  ai_token: 'AI Token',
  cloud_resource: '云资源',
  api_service: 'API 服务',
  software: '软件订阅',
  hosting: '托管服务',
  domain: '域名',
};

// 常见供应商识别
const VENDOR_PATTERNS: Record<string, { name: string; category: string }> = {
  openai: { name: 'OpenAI', category: 'ai_token' },
  anthropic: { name: 'Anthropic', category: 'ai_token' },
  claude: { name: 'Anthropic', category: 'ai_token' },
  'azure openai': { name: 'Azure OpenAI', category: 'ai_token' },
  cursor: { name: 'Cursor', category: 'ai_token' },
  'github copilot': { name: 'GitHub Copilot', category: 'ai_token' },
  copilot: { name: 'GitHub Copilot', category: 'ai_token' },
  aws: { name: 'AWS', category: 'cloud_resource' },
  'amazon web services': { name: 'AWS', category: 'cloud_resource' },
  gcp: { name: 'Google Cloud', category: 'cloud_resource' },
  'google cloud': { name: 'Google Cloud', category: 'cloud_resource' },
  azure: { name: 'Microsoft Azure', category: 'cloud_resource' },
  阿里云: { name: '阿里云', category: 'cloud_resource' },
  aliyun: { name: '阿里云', category: 'cloud_resource' },
  腾讯云: { name: '腾讯云', category: 'cloud_resource' },
  华为云: { name: '华为云', category: 'cloud_resource' },
  vercel: { name: 'Vercel', category: 'hosting' },
  netlify: { name: 'Netlify', category: 'hosting' },
  cloudflare: { name: 'Cloudflare', category: 'hosting' },
  notion: { name: 'Notion', category: 'software' },
  figma: { name: 'Figma', category: 'software' },
  slack: { name: 'Slack', category: 'software' },
  zoom: { name: 'Zoom', category: 'software' },
  lark: { name: '飞书', category: 'software' },
  飞书: { name: '飞书', category: 'software' },
  dingtalk: { name: '钉钉', category: 'software' },
  钉钉: { name: '钉钉', category: 'software' },
  jira: { name: 'Jira', category: 'software' },
  confluence: { name: 'Confluence', category: 'software' },
  atlassian: { name: 'Atlassian', category: 'software' },
  linear: { name: 'Linear', category: 'software' },
  stripe: { name: 'Stripe', category: 'api_service' },
  twilio: { name: 'Twilio', category: 'api_service' },
  sendgrid: { name: 'SendGrid', category: 'api_service' },
  godaddy: { name: 'GoDaddy', category: 'domain' },
  namecheap: { name: 'Namecheap', category: 'domain' },
  万网: { name: '万网', category: 'domain' },
  dnspod: { name: 'DNSPod', category: 'domain' },
};

// 识别供应商
function identifyVendor(vendorStr: string | null): { name: string; category: string } | null {
  if (!vendorStr) return null;

  const lowerVendor = vendorStr.toLowerCase();
  for (const [pattern, info] of Object.entries(VENDOR_PATTERNS)) {
    if (lowerVendor.includes(pattern)) {
      return info;
    }
  }
  return null;
}

interface TechExpenseItem {
  category: string;
  amount: number;
  currency: string;
  amountInBaseCurrency: number;
  vendor: string | null;
  date: Date;
  userId: string;
  userName: string | null;
}

/**
 * GET /api/analytics/tech-expenses
 * 获取技术费用分析数据
 *
 * Query params:
 * - period: 时间范围 (month, quarter, year, custom)
 * - startDate: 自定义开始日期
 * - endDate: 自定义结束日期
 * - scope: 范围 (personal, team, company)
 * - dateFilterType: 日期筛选类型 (expense_date, submission_date, approval_date)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // 支持两种认证方式：
    // 1. Session 认证（前端调用）
    // 2. URL 参数认证（内部工具调用）
    const internalUserId = searchParams.get('internalUserId');
    const internalTenantId = searchParams.get('internalTenantId');

    // 详细日志：记录所有参数
    console.log('[Tech Expenses API] Request details:', {
      url: request.url,
      hasInternalUserId: !!internalUserId,
      hasInternalTenantId: !!internalTenantId,
      internalUserIdValue: internalUserId,
      internalTenantIdValue: internalTenantId,
      allParams: Object.fromEntries(searchParams.entries()),
    });

    let user: any;
    let userId: string;

    if (internalUserId && internalTenantId) {
      // 内部调用（来自 AI 工具执行器）
      console.log('[Tech Expenses API] Internal call from tool executor');
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
    const tenantBaseCurrency = tenant?.baseCurrency || 'USD';

    // searchParams 已在上面定义，直接使用
    const period = searchParams.get('period') || 'month';
    const scope = searchParams.get('scope') || 'personal';
    const dateFilterType = searchParams.get('dateFilterType') || 'expense_date'; // 默认使用费用发生日期（权责发生制）

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
          : new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = searchParams.get('endDate')
          ? new Date(searchParams.get('endDate')!)
          : now;
        break;
      case 'month':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    // 构建查询条件 - 根据dateFilterType选择不同的日期字段
    const conditions = [
      eq(reimbursements.tenantId, user.tenantId),
      inArray(reimbursementItems.category, TECH_CATEGORIES),
      // 只统计已批准和已支付的报销单
      inArray(reimbursements.status, ['approved', 'paid']),
    ];

    // 根据日期筛选类型添加日期条件
    if (dateFilterType === 'expense_date') {
      // 按费用发生日期筛选
      conditions.push(gte(reimbursementItems.date, startDate));
      conditions.push(lte(reimbursementItems.date, endDate));
    } else if (dateFilterType === 'approval_date') {
      // 按审批日期筛选
      conditions.push(gte(reimbursements.approvedAt, startDate));
      conditions.push(lte(reimbursements.approvedAt, endDate));
    } else {
      // 默认按提交日期筛选（submission_date）
      conditions.push(gte(reimbursements.submittedAt, startDate));
      conditions.push(lte(reimbursements.submittedAt, endDate));
    }

    // 根据scope过滤
    if (scope === 'personal') {
      conditions.push(eq(reimbursements.userId, userId));
    }
    // team和company scope暂时都返回公司级数据（后续可根据部门权限过滤）

    // 查询技术费用明细（包含提交日期用于时效性分析）
    const techExpenses = await db
      .select({
        category: reimbursementItems.category,
        amount: reimbursementItems.amount,
        currency: reimbursementItems.currency,
        amountInBaseCurrency: reimbursementItems.amountInBaseCurrency,
        vendor: reimbursementItems.vendor,
        date: reimbursementItems.date, // 费用发生日期
        userId: reimbursements.userId,
        submittedAt: reimbursements.submittedAt, // 报销提交日期
      })
      .from(reimbursementItems)
      .innerJoin(reimbursements, eq(reimbursementItems.reimbursementId, reimbursements.id))
      .where(and(...conditions));

    // 获取用户信息用于显示
    const userIds = [...new Set(techExpenses.map(e => e.userId))];
    const userMap = new Map<string, string>();

    if (userIds.length > 0) {
      const usersData = await db.query.users.findMany({
        where: inArray(users.id, userIds),
        columns: { id: true, name: true },
      });
      usersData.forEach(u => userMap.set(u.id, u.name));
    }

    // 按类别汇总
    const byCategory: Record<string, {
      total: number;
      count: number;
      items: { vendor: string; amount: number }[];
    }> = {};

    TECH_CATEGORIES.forEach(cat => {
      byCategory[cat] = { total: 0, count: 0, items: [] };
    });

    // 按供应商汇总
    const byVendor: Record<string, {
      name: string;
      category: string;
      totalAmount: number;
      count: number;
      users: Set<string>;
    }> = {};

    // 按月份汇总（用于趋势图）
    const byMonth: Record<string, number> = {};

    // 按用户汇总
    const byUser: Record<string, { name: string; total: number; categories: Record<string, number> }> = {};

    // 报销时效性分析
    const timelinessData: number[] = []; // 存储天数间隔
    let totalTimelinessDays = 0;
    let timelynessCount = 0;

    techExpenses.forEach(expense => {
      const category = expense.category;
      const amount = expense.amountInBaseCurrency;
      const vendorInfo = identifyVendor(expense.vendor);
      const vendorName = vendorInfo?.name || expense.vendor || '未知供应商';
      const monthKey = `${expense.date.getFullYear()}-${String(expense.date.getMonth() + 1).padStart(2, '0')}`;
      const userName = userMap.get(expense.userId) || '未知用户';

      // 按类别汇总
      if (byCategory[category]) {
        byCategory[category].total += amount;
        byCategory[category].count += 1;
        byCategory[category].items.push({ vendor: vendorName, amount });
      }

      // 按供应商汇总
      if (!byVendor[vendorName]) {
        byVendor[vendorName] = {
          name: vendorName,
          category: vendorInfo?.category || category,
          totalAmount: 0,
          count: 0,
          users: new Set(),
        };
      }
      byVendor[vendorName].totalAmount += amount;
      byVendor[vendorName].count += 1;
      byVendor[vendorName].users.add(expense.userId);

      // 按月份汇总
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = 0;
      }
      byMonth[monthKey] += amount;

      // 按用户汇总
      if (!byUser[expense.userId]) {
        byUser[expense.userId] = {
          name: userName,
          total: 0,
          categories: {},
        };
      }
      byUser[expense.userId].total += amount;
      if (!byUser[expense.userId].categories[category]) {
        byUser[expense.userId].categories[category] = 0;
      }
      byUser[expense.userId].categories[category] += amount;

      // 计算报销时效性（费用发生日期到提交日期的间隔天数）
      if (expense.date && expense.submittedAt) {
        const expenseDate = new Date(expense.date);
        const submitDate = new Date(expense.submittedAt);
        const daysDiff = Math.floor((submitDate.getTime() - expenseDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDiff >= 0) { // 只统计有效的间隔（提交日期晚于或等于费用日期）
          timelinessData.push(daysDiff);
          totalTimelinessDays += daysDiff;
          timelynessCount++;
        }
      }
    });

    // 计算总计
    const totalAmount = Object.values(byCategory).reduce((sum, cat) => sum + cat.total, 0);

    // === 获取上个月数据用于对比 ===
    const lastMonthStart = new Date(startDate);
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    const lastMonthEnd = new Date(startDate);
    lastMonthEnd.setDate(lastMonthEnd.getDate() - 1);

    const lastMonthConditions = [
      eq(reimbursements.tenantId, user.tenantId),
      inArray(reimbursementItems.category, TECH_CATEGORIES),
      inArray(reimbursements.status, ['approved', 'paid']),
    ];

    // 使用相同的日期筛选类型
    if (dateFilterType === 'expense_date') {
      lastMonthConditions.push(gte(reimbursementItems.date, lastMonthStart));
      lastMonthConditions.push(lte(reimbursementItems.date, lastMonthEnd));
    } else if (dateFilterType === 'approval_date') {
      lastMonthConditions.push(gte(reimbursements.approvedAt, lastMonthStart));
      lastMonthConditions.push(lte(reimbursements.approvedAt, lastMonthEnd));
    } else {
      lastMonthConditions.push(gte(reimbursements.submittedAt, lastMonthStart));
      lastMonthConditions.push(lte(reimbursements.submittedAt, lastMonthEnd));
    }

    if (scope === 'personal') {
      lastMonthConditions.push(eq(reimbursements.userId, userId));
    }

    const lastMonthExpenses = await db
      .select({
        category: reimbursementItems.category,
        amountInBaseCurrency: reimbursementItems.amountInBaseCurrency,
      })
      .from(reimbursementItems)
      .innerJoin(reimbursements, eq(reimbursementItems.reimbursementId, reimbursements.id))
      .where(and(...lastMonthConditions));

    const lastMonthByCategory: Record<string, number> = {};
    TECH_CATEGORIES.forEach(cat => {
      lastMonthByCategory[cat] = 0;
    });

    lastMonthExpenses.forEach(expense => {
      if (lastMonthByCategory[expense.category] !== undefined) {
        lastMonthByCategory[expense.category] += expense.amountInBaseCurrency;
      }
    });

    const lastMonthTotal = Object.values(lastMonthByCategory).reduce((sum, amount) => sum + amount, 0);

    // 计算月环比增长
    const monthOverMonthGrowth = lastMonthTotal > 0
      ? Math.round(((totalAmount - lastMonthTotal) / lastMonthTotal) * 1000) / 10
      : 0;

    // 格式化类别数据（增加月环比）
    const categoryData = Object.entries(byCategory).map(([key, value]) => {
      const lastMonthAmount = lastMonthByCategory[key] || 0;
      const categoryGrowth = lastMonthAmount > 0
        ? Math.round(((value.total - lastMonthAmount) / lastMonthAmount) * 1000) / 10
        : value.total > 0 ? 100 : 0;

      return {
        category: key,
        label: CATEGORY_LABELS[key] || key,
        total: Math.round(value.total * 100) / 100,
        count: value.count,
        percentage: totalAmount > 0 ? Math.round((value.total / totalAmount) * 1000) / 10 : 0,
        lastMonthTotal: Math.round(lastMonthAmount * 100) / 100,
        growth: categoryGrowth,
        topVendors: Object.entries(
          value.items.reduce((acc, item) => {
            acc[item.vendor] = (acc[item.vendor] || 0) + item.amount;
            return acc;
          }, {} as Record<string, number>)
        )
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 })),
      };
    });

    // 格式化供应商数据
    const vendorData = Object.values(byVendor)
      .map(v => ({
        name: v.name,
        category: v.category,
        categoryLabel: CATEGORY_LABELS[v.category] || v.category,
        totalAmount: Math.round(v.totalAmount * 100) / 100,
        count: v.count,
        userCount: v.users.size,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    // 格式化月度趋势数据
    const monthlyTrend = Object.entries(byMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, amount]) => ({
        month,
        amount: Math.round(amount * 100) / 100,
      }));

    // 格式化用户排行
    const userRanking = Object.entries(byUser)
      .map(([userId, data]) => ({
        userId,
        name: data.name,
        total: Math.round(data.total * 100) / 100,
        topCategory: Object.entries(data.categories)
          .sort((a, b) => b[1] - a[1])[0]?.[0] || null,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // AI Token 特别分析
    const aiTokenAnalysis = {
      total: byCategory['ai_token']?.total || 0,
      topProviders: vendorData
        .filter(v => v.category === 'ai_token')
        .slice(0, 5),
      // 简单的优化建议
      suggestions: [] as string[],
    };

    // 生成AI Token优化建议
    if (aiTokenAnalysis.total > 0) {
      const openaiUsage = vendorData.find(v => v.name === 'OpenAI');
      if (openaiUsage && openaiUsage.totalAmount > aiTokenAnalysis.total * 0.5) {
        aiTokenAnalysis.suggestions.push(
          `OpenAI 占 AI 费用的 ${Math.round((openaiUsage.totalAmount / aiTokenAnalysis.total) * 100)}%，可考虑在适合的场景使用 Claude 或开源模型降低成本`
        );
      }

      if (aiTokenAnalysis.topProviders.length === 1) {
        aiTokenAnalysis.suggestions.push(
          '目前只使用单一 AI 供应商，建议评估其他供应商以优化成本和避免供应商锁定'
        );
      }
    }

    // 云资源分析
    const cloudAnalysis = {
      total: byCategory['cloud_resource']?.total || 0,
      topProviders: vendorData
        .filter(v => v.category === 'cloud_resource')
        .slice(0, 5),
    };

    // SaaS 订阅分析
    const saasAnalysis = {
      total: byCategory['software']?.total || 0,
      activeSubscriptions: vendorData.filter(v => v.category === 'software').length,
      topSubscriptions: vendorData
        .filter(v => v.category === 'software')
        .slice(0, 5),
    };

    // 计算平均值和趋势
    const avgMonthlyAmount = monthlyTrend.length > 0
      ? Math.round((monthlyTrend.reduce((sum, m) => sum + m.amount, 0) / monthlyTrend.length) * 100) / 100
      : 0;

    // 计算趋势方向（最近3个月）
    const recentMonths = monthlyTrend.slice(-3);
    const trendDirection = recentMonths.length >= 2
      ? recentMonths[recentMonths.length - 1].amount > recentMonths[0].amount ? 'up' : 'down'
      : 'stable';

    // 计算报销时效性统计
    const timelinessAnalysis = timelynessCount > 0 ? {
      averageDays: Math.round((totalTimelinessDays / timelynessCount) * 10) / 10,
      maxDays: Math.max(...timelinessData),
      minDays: Math.min(...timelinessData),
      medianDays: timelinessData.sort((a, b) => a - b)[Math.floor(timelinessData.length / 2)] || 0,
      within7Days: timelinessData.filter(d => d <= 7).length,
      within30Days: timelinessData.filter(d => d <= 30).length,
      over30Days: timelinessData.filter(d => d > 30).length,
      over60Days: timelinessData.filter(d => d > 60).length,
      over90Days: timelinessData.filter(d => d > 90).length,
      totalCount: timelynessCount,
      complianceRate: Math.round((timelinessData.filter(d => d <= 30).length / timelynessCount) * 1000) / 10, // 30天内提交率
    } : null;

    return NextResponse.json({
      success: true,
      data: {
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          label: period,
          dateFilterType, // 添加日期筛选类型信息
        },
        scope,
        summary: {
          totalAmount: Math.round(totalAmount * 100) / 100,
          currency: tenantBaseCurrency,
          categoryCount: categoryData.filter(c => c.total > 0).length,
          vendorCount: vendorData.length,
          lastMonthTotal: Math.round(lastMonthTotal * 100) / 100,
          monthOverMonthGrowth,
          avgMonthlyAmount,
          trendDirection,
        },
        comparison: {
          lastMonth: {
            total: Math.round(lastMonthTotal * 100) / 100,
            byCategory: Object.entries(lastMonthByCategory).map(([key, value]) => ({
              category: key,
              label: CATEGORY_LABELS[key] || key,
              total: Math.round(value * 100) / 100,
            })),
          },
          growth: {
            absolute: Math.round((totalAmount - lastMonthTotal) * 100) / 100,
            percentage: monthOverMonthGrowth,
          },
        },
        byCategory: categoryData,
        byVendor: vendorData.slice(0, 20), // 返回前20个供应商
        monthlyTrend,
        userRanking: scope !== 'personal' ? userRanking : undefined,
        aiTokenAnalysis,
        cloudAnalysis,
        saasAnalysis,
        timelinessAnalysis, // 报销时效性分析
      },
    });
  } catch (error) {
    console.error('Tech expenses analysis error:', error);
    return NextResponse.json({ error: '获取技术费用分析失败' }, { status: 500 });
  }
}
