/**
 * Debug API for tech expenses
 * Shows detailed breakdown of what's being counted and what's not
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, reimbursements, reimbursementItems, tenants } from '@/lib/db/schema';
import { eq, and, gte, lte, inArray, or, like } from 'drizzle-orm';

const TECH_CATEGORIES = [
  'ai_token',
  'cloud_resource',
  'api_service',
  'software',
  'hosting',
  'domain',
];

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
    const scope = searchParams.get('scope') || 'personal';

    // Query for current month (February 2026)
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = now;

    console.log('=== Debug Tech Expenses Query ===');
    console.log('User ID:', session.user.id);
    console.log('Tenant ID:', user.tenantId);
    console.log('Date Range:', startDate.toISOString(), 'to', endDate.toISOString());
    console.log('Scope:', scope);

    // Query ALL tech-related items (no status filter)
    const allTechItems = await db
      .select({
        reimbursementId: reimbursements.id,
        reimbursementTitle: reimbursements.title,
        reimbursementStatus: reimbursements.status,
        reimbursementSubmittedAt: reimbursements.submittedAt,
        reimbursementUserId: reimbursements.userId,
        itemId: reimbursementItems.id,
        itemCategory: reimbursementItems.category,
        itemDescription: reimbursementItems.description,
        itemAmount: reimbursementItems.amount,
        itemCurrency: reimbursementItems.currency,
        itemAmountInBase: reimbursementItems.amountInBaseCurrency,
        itemVendor: reimbursementItems.vendor,
        itemDate: reimbursementItems.date,
      })
      .from(reimbursementItems)
      .innerJoin(reimbursements, eq(reimbursementItems.reimbursementId, reimbursements.id))
      .where(and(
        eq(reimbursements.tenantId, user.tenantId),
        inArray(reimbursementItems.category, TECH_CATEGORIES),
        scope === 'personal' ? eq(reimbursements.userId, session.user.id) : undefined
      ));

    console.log('Total tech items found (all statuses):', allTechItems.length);

    // Also check for items with AI-related keywords but different categories
    const potentialAIItems = await db
      .select({
        reimbursementId: reimbursements.id,
        reimbursementTitle: reimbursements.title,
        reimbursementStatus: reimbursements.status,
        itemId: reimbursementItems.id,
        itemCategory: reimbursementItems.category,
        itemDescription: reimbursementItems.description,
        itemAmountInBase: reimbursementItems.amountInBaseCurrency,
        itemVendor: reimbursementItems.vendor,
        itemDate: reimbursementItems.date,
      })
      .from(reimbursementItems)
      .innerJoin(reimbursements, eq(reimbursementItems.reimbursementId, reimbursements.id))
      .where(and(
        eq(reimbursements.tenantId, user.tenantId),
        or(
          like(reimbursementItems.description, '%AI%'),
          like(reimbursementItems.description, '%ai%'),
          like(reimbursementItems.description, '%OpenAI%'),
          like(reimbursementItems.description, '%Claude%'),
          like(reimbursementItems.description, '%token%'),
          like(reimbursements.title, '%AI%'),
          like(reimbursements.title, '%ai%'),
        ),
        scope === 'personal' ? eq(reimbursements.userId, session.user.id) : undefined
      ));

    console.log('Potential AI items (by keyword):', potentialAIItems.length);

    // Group by status
    const byStatus = allTechItems.reduce((acc, item) => {
      const status = item.reimbursementStatus;
      if (!acc[status]) {
        acc[status] = { count: 0, total: 0, items: [] };
      }
      acc[status].count++;
      acc[status].total += item.itemAmountInBase || 0;
      acc[status].items.push({
        title: item.reimbursementTitle,
        description: item.itemDescription,
        amount: item.itemAmountInBase,
        category: item.itemCategory,
        itemDate: item.itemDate,
        submittedAt: item.reimbursementSubmittedAt,
      });
      return acc;
    }, {} as Record<string, any>);

    // Group by category
    const byCategory = allTechItems.reduce((acc, item) => {
      const cat = item.itemCategory;
      if (!acc[cat]) {
        acc[cat] = { count: 0, total: 0, items: [] };
      }
      acc[cat].count++;
      acc[cat].total += item.itemAmountInBase || 0;
      acc[cat].items.push({
        title: item.reimbursementTitle,
        description: item.itemDescription,
        amount: item.itemAmountInBase,
        status: item.reimbursementStatus,
        itemDate: item.itemDate,
      });
      return acc;
    }, {} as Record<string, any>);

    // Filter by item date (current API logic)
    const itemsInDateRange = allTechItems.filter(item =>
      item.itemDate >= startDate && item.itemDate <= endDate
    );

    // Filter by approved/paid status
    const approvedItems = itemsInDateRange.filter(item =>
      item.reimbursementStatus === 'approved' || item.reimbursementStatus === 'paid'
    );

    const response = {
      debug: {
        userId: session.user.id,
        tenantId: user.tenantId,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        scope,
      },
      summary: {
        totalTechItems: allTechItems.length,
        itemsInDateRange: itemsInDateRange.length,
        approvedInDateRange: approvedItems.length,
        potentialAIByKeyword: potentialAIItems.length,
      },
      byStatus,
      byCategory,
      approvedItemsDetails: approvedItems.map(item => ({
        reimbursementTitle: item.reimbursementTitle,
        reimbursementStatus: item.reimbursementStatus,
        category: item.itemCategory,
        description: item.itemDescription,
        amount: item.itemAmountInBase,
        vendor: item.itemVendor,
        itemDate: item.itemDate?.toISOString(),
        submittedAt: item.reimbursementSubmittedAt?.toISOString(),
      })),
      itemsOutsideDateRange: allTechItems
        .filter(item => item.itemDate < startDate || item.itemDate > endDate)
        .map(item => ({
          reimbursementTitle: item.reimbursementTitle,
          category: item.itemCategory,
          description: item.itemDescription,
          amount: item.itemAmountInBase,
          itemDate: item.itemDate?.toISOString(),
          submittedAt: item.reimbursementSubmittedAt?.toISOString(),
          status: item.reimbursementStatus,
          reason: item.itemDate < startDate ? 'before_start_date' : 'after_end_date',
        })),
      potentialAIItems: potentialAIItems.map(item => ({
        title: item.reimbursementTitle,
        category: item.itemCategory,
        description: item.itemDescription,
        amount: item.itemAmountInBase,
        vendor: item.itemVendor,
        status: item.reimbursementStatus,
        itemDate: item.itemDate?.toISOString(),
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Debug API error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
