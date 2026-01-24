import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { policies, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

// Default policies based on company requirements
const createDefaultPolicies = (tenantId: string) => [
  {
    id: uuid(),
    tenantId,
    name: '差旅费报销政策',
    description: '出差期间住宿和餐饮费用限额',
    isActive: true,
    priority: 1,
    rules: [
      {
        id: uuid(),
        name: '中国大陆出差每日限额',
        description: '中国大陆地区出差，住宿+餐饮每人每天不超过100美金',
        categories: ['hotel', 'meal'],
        limit: {
          type: 'per_day',
          amount: 100,
          currency: 'USD',
        },
        condition: {
          type: 'location',
          operator: 'in',
          value: ['中国', 'China', '中国大陆', 'Mainland China'],
        },
        requiresReceipt: true,
        requiresApproval: false,
        message: '中国大陆出差，住宿+餐饮每人每天不超过$100',
      },
      {
        id: uuid(),
        name: '海外出差每日限额',
        description: '海外地区出差，住宿+餐饮每人每天不超过200美金',
        categories: ['hotel', 'meal'],
        limit: {
          type: 'per_day',
          amount: 200,
          currency: 'USD',
        },
        condition: {
          type: 'location',
          operator: 'not_in',
          value: ['中国', 'China', '中国大陆', 'Mainland China'],
        },
        requiresReceipt: true,
        requiresApproval: false,
        message: '海外出差，住宿+餐饮每人每天不超过$200',
      },
    ],
    createdVia: 'ui',
  },
  {
    id: uuid(),
    tenantId,
    name: 'AI工具订阅政策',
    description: 'AI工具和服务的月度报销限额',
    isActive: true,
    priority: 2,
    rules: [
      {
        id: uuid(),
        name: 'AI工具月度限额',
        description: 'AI工具（如ChatGPT、Claude、Cursor等）每月报销不超过100美金',
        categories: ['ai_token', 'software'],
        limit: {
          type: 'per_month',
          amount: 100,
          currency: 'USD',
        },
        requiresReceipt: true,
        requiresApproval: false,
        message: 'AI工具每月报销不超过$100',
      },
    ],
    createdVia: 'ui',
  },
];

/**
 * GET /api/settings/policies - 获取所有政策
 */
export async function GET() {
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

    // 获取该租户的所有政策
    let policyList = await db.query.policies.findMany({
      where: eq(policies.tenantId, user.tenantId),
      orderBy: (policies, { asc }) => [asc(policies.priority)],
    });

    // 如果没有政策，创建默认政策
    if (policyList.length === 0) {
      const defaultPolicies = createDefaultPolicies(user.tenantId);

      for (const policy of defaultPolicies) {
        await db.insert(policies).values({
          id: policy.id,
          tenantId: policy.tenantId,
          name: policy.name,
          description: policy.description,
          isActive: policy.isActive,
          priority: policy.priority,
          rules: policy.rules,
          createdVia: policy.createdVia,
        });
      }

      policyList = await db.query.policies.findMany({
        where: eq(policies.tenantId, user.tenantId),
        orderBy: (policies, { asc }) => [asc(policies.priority)],
      });
    }

    return NextResponse.json({
      success: true,
      data: policyList,
    });
  } catch (error) {
    console.error('Get policies error:', error);
    return NextResponse.json({ error: '获取政策失败' }, { status: 500 });
  }
}

/**
 * POST /api/settings/policies - 创建新政策
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

    // 检查权限
    if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'finance') {
      return NextResponse.json({ error: '无权限创建政策' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, isActive, priority, rules } = body;

    if (!name) {
      return NextResponse.json({ error: '政策名称不能为空' }, { status: 400 });
    }

    const newPolicy = await db.insert(policies).values({
      id: uuid(),
      tenantId: user.tenantId,
      name,
      description: description || '',
      isActive: isActive ?? true,
      priority: priority ?? 0,
      rules: rules || [],
      createdVia: 'ui',
    }).returning();

    return NextResponse.json({
      success: true,
      data: newPolicy[0],
    });
  } catch (error) {
    console.error('Create policy error:', error);
    return NextResponse.json({ error: '创建政策失败' }, { status: 500 });
  }
}
