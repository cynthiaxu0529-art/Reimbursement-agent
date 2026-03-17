import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { policies, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/policies - 调试政策规则（临时使用）
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 获取用户的 tenantId
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 400 });
    }

    // 获取租户的所有活跃政策
    const tenantPolicies = await db.query.policies.findMany({
      where: and(
        eq(policies.tenantId, user.tenantId),
        eq(policies.isActive, true)
      ),
    });

    // 分析规则格式
    const analysis = tenantPolicies.map(policy => {
      const rules = policy.rules as any[] | null;
      return {
        policyId: policy.id,
        policyName: policy.name,
        rulesCount: rules?.length || 0,
        rules: rules?.map(rule => ({
          id: rule.id,
          name: rule.name,
          // 检查 category vs categories
          hasCategory: !!rule.category,
          hasCategories: !!rule.categories,
          category: rule.category,
          categories: rule.categories,
          // 限额信息
          hasLimit: !!rule.limit,
          limit: rule.limit,
        })),
      };
    });

    return NextResponse.json({
      tenantId: user.tenantId,
      policiesCount: tenantPolicies.length,
      analysis,
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
