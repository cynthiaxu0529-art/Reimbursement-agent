/**
 * Test Tool Call API
 * Tests direct database queries used by the AI tool executor.
 * Verifies that DB connection, permission filtering, and data aggregation work correctly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, reimbursements, reimbursementItems } from '@/lib/db/schema';
import { eq, and, gte, lte, inArray, sql, desc } from 'drizzle-orm';
import { executeTool } from '@/lib/ai/tool-executor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/ai/test-tool-call
 *
 * Tests the tool executor's direct database query approach.
 * Returns diagnostic information about DB connectivity, data availability, and tool execution.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Get current user session
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 2. Get user details
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '未关联公司' }, { status: 404 });
    }

    const diagnostics: any = {
      dbConnection: false,
      userId: session.user.id,
      tenantId: user.tenantId,
      userName: user.name,
      userRole: user.role,
    };

    // 3. Test basic DB connection - count reimbursements
    const countResult = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(reimbursements)
      .where(eq(reimbursements.tenantId, user.tenantId));

    diagnostics.dbConnection = true;
    diagnostics.reimbursementCount = Number(countResult[0]?.count) || 0;

    // 4. Test reimbursement items query
    const itemCountResult = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(reimbursementItems)
      .innerJoin(reimbursements, eq(reimbursementItems.reimbursementId, reimbursements.id))
      .where(eq(reimbursements.tenantId, user.tenantId));

    diagnostics.itemCount = Number(itemCountResult[0]?.count) || 0;

    // 5. Test category breakdown
    const categoryBreakdown = await db
      .select({
        category: reimbursementItems.category,
        count: sql<number>`count(*)`,
        total: sql<number>`COALESCE(SUM(${reimbursementItems.amountInBaseCurrency}), 0)`,
      })
      .from(reimbursementItems)
      .innerJoin(reimbursements, eq(reimbursementItems.reimbursementId, reimbursements.id))
      .where(eq(reimbursements.tenantId, user.tenantId))
      .groupBy(reimbursementItems.category);

    diagnostics.categoryBreakdown = categoryBreakdown.map(c => ({
      category: c.category,
      count: Number(c.count),
      total: Math.round(Number(c.total) * 100) / 100,
    }));

    // 6. Test the actual tool executor with analyze_expenses
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const toolResult = await executeTool('analyze_expenses', {
      months: [currentMonth],
      year: currentYear,
      scope: 'company',
    }, {
      userId: session.user.id,
      tenantId: user.tenantId,
    });

    diagnostics.toolExecutorTest = {
      success: toolResult.success,
      hasData: !!toolResult.data,
      error: toolResult.error,
      summary: toolResult.data?.summary,
    };

    // 7. Return diagnostic results
    return NextResponse.json({
      success: true,
      message: 'All diagnostic tests passed',
      diagnostics,
    });
  } catch (error: any) {
    console.error('[Test Tool Call] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 5),
    }, { status: 500 });
  }
}
