/**
 * AI 系统诊断端点
 *
 * 逐步测试 AI 分析功能的每个环节：
 * 1. 环境变量配置
 * 2. 数据库连接
 * 3. 数据查询
 * 4. 工具执行
 * 5. Skill 执行
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

interface DiagnosticStep {
  step: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
  data?: any;
  error?: string;
  duration?: number;
}

export async function GET(request: NextRequest) {
  const steps: DiagnosticStep[] = [];
  let userId: string | null = null;
  let tenantId: string | null = null;

  // ========== Step 1: 环境变量检查 ==========
  const envStart = Date.now();
  try {
    const envCheck = {
      DATABASE_URL: !!process.env.DATABASE_URL,
      POSTGRES_URL: !!process.env.POSTGRES_URL,
      OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
      NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || '(not set)',
      VERCEL_URL: process.env.VERCEL_URL || '(not set)',
    };

    const hasDbUrl = envCheck.DATABASE_URL || envCheck.POSTGRES_URL;

    steps.push({
      step: '1. 环境变量',
      status: hasDbUrl ? 'pass' : 'fail',
      message: hasDbUrl ? '数据库连接字符串已配置' : '缺少 DATABASE_URL 或 POSTGRES_URL',
      data: envCheck,
      duration: Date.now() - envStart,
    });

    if (!hasDbUrl) {
      return NextResponse.json({ steps, summary: '环境变量配置缺失' });
    }
  } catch (error: any) {
    steps.push({
      step: '1. 环境变量',
      status: 'fail',
      message: '检查环境变量时出错',
      error: error.message,
      duration: Date.now() - envStart,
    });
    return NextResponse.json({ steps, summary: '环境变量检查失败' });
  }

  // ========== Step 2: 认证检查 ==========
  const authStart = Date.now();
  try {
    const session = await auth();
    if (!session?.user) {
      steps.push({
        step: '2. 用户认证',
        status: 'fail',
        message: '用户未登录，请先登录',
        duration: Date.now() - authStart,
      });
      return NextResponse.json({ steps, summary: '需要登录' }, { status: 401 });
    }

    userId = session.user.id;
    steps.push({
      step: '2. 用户认证',
      status: 'pass',
      message: '用户已登录',
      data: { userId, email: session.user.email },
      duration: Date.now() - authStart,
    });
  } catch (error: any) {
    steps.push({
      step: '2. 用户认证',
      status: 'fail',
      message: '认证检查失败',
      error: error.message,
      duration: Date.now() - authStart,
    });
    return NextResponse.json({ steps, summary: '认证失败' });
  }

  // ========== Step 3: 数据库连接测试 ==========
  const dbStart = Date.now();
  try {
    const { db } = await import('@/lib/db');
    const { users } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');

    // 简单查询测试连接
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId!),
    });

    if (!user) {
      steps.push({
        step: '3. 数据库连接',
        status: 'fail',
        message: '数据库连接成功，但找不到当前用户',
        duration: Date.now() - dbStart,
      });
      return NextResponse.json({ steps, summary: '用户数据缺失' });
    }

    tenantId = user.tenantId;
    steps.push({
      step: '3. 数据库连接',
      status: 'pass',
      message: '数据库连接正常',
      data: {
        userName: user.name,
        userRole: user.role,
        tenantId: user.tenantId,
      },
      duration: Date.now() - dbStart,
    });

    if (!tenantId) {
      steps.push({
        step: '3.1 租户关联',
        status: 'fail',
        message: '用户未关联租户/公司',
        duration: 0,
      });
      return NextResponse.json({ steps, summary: '用户未关联公司' });
    }
  } catch (error: any) {
    steps.push({
      step: '3. 数据库连接',
      status: 'fail',
      message: '数据库连接失败',
      error: error.message,
      duration: Date.now() - dbStart,
    });
    return NextResponse.json({ steps, summary: '数据库连接失败' });
  }

  // ========== Step 4: 数据查询测试 ==========
  const queryStart = Date.now();
  try {
    const { db } = await import('@/lib/db');
    const { reimbursements, reimbursementItems } = await import('@/lib/db/schema');
    const { eq, sql } = await import('drizzle-orm');

    // 查询报销单数量
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(reimbursements)
      .where(eq(reimbursements.tenantId, tenantId!));

    const reimbursementCount = Number(countResult[0]?.count) || 0;

    // 查询报销明细数量
    const itemCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(reimbursementItems)
      .innerJoin(reimbursements, eq(reimbursementItems.reimbursementId, reimbursements.id))
      .where(eq(reimbursements.tenantId, tenantId!));

    const itemCount = Number(itemCountResult[0]?.count) || 0;

    steps.push({
      step: '4. 数据查询',
      status: 'pass',
      message: `找到 ${reimbursementCount} 个报销单，${itemCount} 条明细`,
      data: { reimbursementCount, itemCount },
      duration: Date.now() - queryStart,
    });

    if (reimbursementCount === 0) {
      steps.push({
        step: '4.1 数据检查',
        status: 'fail',
        message: '数据库中没有报销数据，无法进行分析',
        duration: 0,
      });
    }
  } catch (error: any) {
    steps.push({
      step: '4. 数据查询',
      status: 'fail',
      message: '数据查询失败',
      error: error.message,
      duration: Date.now() - queryStart,
    });
    return NextResponse.json({ steps, summary: '数据查询失败' });
  }

  // ========== Step 5: 工具执行测试 ==========
  const toolStart = Date.now();
  try {
    const { executeTool } = await import('@/lib/ai/tool-executor');

    const now = new Date();
    const result = await executeTool('analyze_expenses', {
      months: [now.getMonth() + 1],
      year: now.getFullYear(),
      scope: 'company',
    }, {
      userId: userId!,
      tenantId: tenantId!,
    });

    steps.push({
      step: '5. 工具执行 (analyze_expenses)',
      status: result.success ? 'pass' : 'fail',
      message: result.success
        ? `分析成功：${result.data?.summary?.totalCount || 0} 个报销单，总额 ${result.data?.summary?.totalAmount || 0}`
        : `分析失败：${result.error}`,
      data: result.success ? {
        summary: result.data?.summary,
        categoryCount: result.data?.byCategory?.length,
      } : undefined,
      error: result.error,
      duration: Date.now() - toolStart,
    });
  } catch (error: any) {
    steps.push({
      step: '5. 工具执行',
      status: 'fail',
      message: '工具执行异常',
      error: error.message,
      duration: Date.now() - toolStart,
    });
  }

  // ========== Step 6: Skill 执行测试 ==========
  const skillStart = Date.now();
  try {
    const { getBuiltInSkills } = await import('@/lib/skills/skill-manager');

    const skills = getBuiltInSkills(tenantId!);
    const chatSkills = skills.filter(s =>
      s.isActive && s.triggers.some(t => t.type === 'on_chat_command')
    );

    steps.push({
      step: '6. Skill 加载',
      status: 'pass',
      message: `已加载 ${skills.length} 个内置 Skill，其中 ${chatSkills.length} 个支持聊天命令`,
      data: {
        allSkills: skills.map(s => s.id),
        chatSkills: chatSkills.map(s => s.id),
      },
      duration: Date.now() - skillStart,
    });
  } catch (error: any) {
    steps.push({
      step: '6. Skill 加载',
      status: 'fail',
      message: 'Skill 加载失败',
      error: error.message,
      duration: Date.now() - skillStart,
    });
  }

  // ========== Step 7: OpenRouter API 测试 ==========
  const llmStart = Date.now();
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      steps.push({
        step: '7. LLM API',
        status: 'fail',
        message: 'OPENROUTER_API_KEY 未配置',
        duration: Date.now() - llmStart,
      });
    } else {
      steps.push({
        step: '7. LLM API',
        status: 'pass',
        message: 'OPENROUTER_API_KEY 已配置',
        data: {
          keyPrefix: process.env.OPENROUTER_API_KEY.substring(0, 15) + '...',
          keyLength: process.env.OPENROUTER_API_KEY.length,
        },
        duration: Date.now() - llmStart,
      });
    }
  } catch (error: any) {
    steps.push({
      step: '7. LLM API',
      status: 'fail',
      message: 'LLM 配置检查失败',
      error: error.message,
      duration: Date.now() - llmStart,
    });
  }

  // ========== 汇总 ==========
  const passCount = steps.filter(s => s.status === 'pass').length;
  const failCount = steps.filter(s => s.status === 'fail').length;

  const summary = failCount === 0
    ? `✅ 所有 ${passCount} 项检查通过`
    : `❌ ${failCount} 项检查失败，${passCount} 项通过`;

  return NextResponse.json({
    success: failCount === 0,
    summary,
    steps,
    timestamp: new Date().toISOString(),
  });
}
