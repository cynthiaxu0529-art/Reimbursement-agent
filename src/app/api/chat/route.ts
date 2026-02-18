import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, users } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getAIClient } from '@/lib/ai/openrouter';
import { getUserRoles } from '@/lib/auth/roles';
import { getVisibleUserIds } from '@/lib/department/department-service';
import { inArray } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * POST /api/chat - AI 助手对话接口
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { message, conversationHistory = [] } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: '消息不能为空' }, { status: 400 });
    }

    // 获取当前用户信息
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!currentUser) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    const userRoles = getUserRoles(currentUser);

    // 获取用户可见的报销数据作为 AI 上下文
    let reimbursementData: any[] = [];
    if (currentUser.tenantId) {
      const visibleUserIds = await getVisibleUserIds(
        session.user.id,
        currentUser.tenantId,
        userRoles
      );

      const conditions: any[] = [
        eq(reimbursements.tenantId, currentUser.tenantId),
      ];

      if (visibleUserIds !== null) {
        // 有限制的用户列表
        if (visibleUserIds.length > 0) {
          conditions.push(inArray(reimbursements.userId, visibleUserIds));
        } else {
          conditions.push(eq(reimbursements.userId, session.user.id));
        }
      }

      reimbursementData = await db.query.reimbursements.findMany({
        where: and(...conditions),
        orderBy: [desc(reimbursements.createdAt)],
        limit: 200,
        with: {
          items: true,
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
              department: true,
            },
          },
        },
      });
    }

    // 构建报销数据摘要
    const dataSummary = buildDataSummary(reimbursementData, currentUser);

    // 构建系统提示
    const systemPrompt = buildSystemPrompt(currentUser, dataSummary);

    // 构建消息历史
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
    ];

    // 添加历史对话（最近 10 轮）
    const recentHistory = conversationHistory.slice(-20);
    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // 添加当前用户消息
    messages.push({ role: 'user', content: message });

    // 调用 OpenRouter Claude 模型
    const aiClient = getAIClient();
    const response = await aiClient.chat(messages, {
      model: 'anthropic/claude-sonnet-4',
      maxTokens: 4096,
      temperature: 0.3,
    });

    return NextResponse.json({
      success: true,
      data: {
        message: response,
        model: 'anthropic/claude-sonnet-4',
      },
    });
  } catch (error: any) {
    console.error('Chat API error:', error);

    // 区分错误类型
    if (error.message?.includes('OPENROUTER_API_KEY')) {
      return NextResponse.json(
        { error: 'AI 服务未配置，请联系管理员设置 OPENROUTER_API_KEY' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: `AI 助手暂时无法使用: ${error?.message || '未知错误'}` },
      { status: 500 }
    );
  }
}

/**
 * 构建报销数据摘要（供 AI 分析使用）
 */
function buildDataSummary(reimbursementData: any[], currentUser: any): string {
  if (reimbursementData.length === 0) {
    return '当前没有可查看的报销数据。';
  }

  const total = reimbursementData.length;
  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, { count: number; amount: number }> = {};
  let totalAmount = 0;
  let pendingCount = 0;
  let approvedCount = 0;
  let paidCount = 0;
  let rejectedCount = 0;

  // 按月统计
  const byMonth: Record<string, { count: number; amount: number }> = {};

  for (const r of reimbursementData) {
    // 状态统计
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    const amount = r.totalAmountInBaseCurrency || r.totalAmount || 0;
    totalAmount += amount;

    if (r.status === 'pending' || r.status === 'submitted') pendingCount++;
    if (r.status === 'approved') approvedCount++;
    if (r.status === 'paid') paidCount++;
    if (r.status === 'rejected') rejectedCount++;

    // 按月统计
    const month = new Date(r.createdAt).toISOString().slice(0, 7);
    if (!byMonth[month]) byMonth[month] = { count: 0, amount: 0 };
    byMonth[month].count++;
    byMonth[month].amount += amount;

    // 按类别统计（从明细中提取）
    if (r.items && Array.isArray(r.items)) {
      for (const item of r.items) {
        const cat = item.category || '其他';
        if (!byCategory[cat]) byCategory[cat] = { count: 0, amount: 0 };
        byCategory[cat].count++;
        byCategory[cat].amount += item.amountInBaseCurrency || item.amount || 0;
      }
    }
  }

  // 提交人统计（如果有权限看到多人数据）
  const submitters: Record<string, { name: string; count: number; amount: number }> = {};
  for (const r of reimbursementData) {
    const userId = r.userId;
    const userName = r.user?.name || '未知';
    if (!submitters[userId]) submitters[userId] = { name: userName, count: 0, amount: 0 };
    submitters[userId].count++;
    submitters[userId].amount += r.totalAmountInBaseCurrency || r.totalAmount || 0;
  }

  let summary = `=== 报销数据摘要 ===\n`;
  summary += `报销总数: ${total} 笔\n`;
  summary += `总金额: $${totalAmount.toFixed(2)}\n`;
  summary += `待审批: ${pendingCount} 笔 | 已批准: ${approvedCount} 笔 | 已打款: ${paidCount} 笔 | 已拒绝: ${rejectedCount} 笔\n\n`;

  // 按月统计
  summary += `--- 月度统计 ---\n`;
  const sortedMonths = Object.entries(byMonth).sort(([a], [b]) => b.localeCompare(a));
  for (const [month, data] of sortedMonths.slice(0, 6)) {
    summary += `${month}: ${data.count} 笔, $${data.amount.toFixed(2)}\n`;
  }

  // 按类别统计
  if (Object.keys(byCategory).length > 0) {
    summary += `\n--- 费用类别统计 ---\n`;
    const sortedCategories = Object.entries(byCategory).sort(([, a], [, b]) => b.amount - a.amount);
    for (const [cat, data] of sortedCategories) {
      summary += `${cat}: ${data.count} 笔, $${data.amount.toFixed(2)}\n`;
    }
  }

  // 提交人统计（如果有多人）
  if (Object.keys(submitters).length > 1) {
    summary += `\n--- 按提交人统计 ---\n`;
    const sortedSubmitters = Object.entries(submitters).sort(([, a], [, b]) => b.amount - a.amount);
    for (const [, data] of sortedSubmitters.slice(0, 10)) {
      summary += `${data.name}: ${data.count} 笔, $${data.amount.toFixed(2)}\n`;
    }
  }

  // 最近 5 笔报销明细
  summary += `\n--- 最近 5 笔报销 ---\n`;
  for (const r of reimbursementData.slice(0, 5)) {
    const statusLabels: Record<string, string> = {
      draft: '草稿', pending: '待审批', submitted: '待审批',
      approved: '已批准', rejected: '已拒绝', paid: '已打款',
      processing: '处理中', under_review: '审核中',
    };
    const amount = r.totalAmountInBaseCurrency || r.totalAmount || 0;
    summary += `- ${r.title || '未命名'} | $${amount.toFixed(2)} | ${statusLabels[r.status] || r.status} | ${r.user?.name || '自己'} | ${new Date(r.createdAt).toLocaleDateString('zh-CN')}\n`;
  }

  return summary;
}

/**
 * 构建系统提示
 */
function buildSystemPrompt(currentUser: any, dataSummary: string): string {
  const userRoles = getUserRoles(currentUser);
  const roleLabels: Record<string, string> = {
    employee: '员工', manager: '经理', finance: '财务',
    admin: '管理员', super_admin: '超级管理员',
  };
  const roleStr = userRoles.map(r => roleLabels[r] || r).join('、');

  return `你是 Fluxa 智能报销助手，一个专业的企业报销分析和管理 AI。

## 当前用户信息
- 姓名: ${currentUser.name || '未知'}
- 邮箱: ${currentUser.email || '未知'}
- 角色: ${roleStr}
- 部门: ${currentUser.department || '未设置'}

## 你可以做的事情
1. **费用数据分析**: 分析报销数据趋势、费用构成、部门支出对比
2. **政策查询**: 解答报销政策相关问题
3. **预算预警**: 检测预算使用情况和超标风险
4. **异常检测**: 发现异常消费模式和潜在风险
5. **报销建议**: 提供报销流程优化建议

## 当前可用的报销数据
${dataSummary}

## 回答要求
- 使用中文回答
- 基于真实数据进行分析，给出具体的数字和百分比
- 如果数据不足以支撑分析，如实告知用户
- 分析时提供可视化的格式（使用表格、列表等）
- 提供可操作的建议
- 金额单位为美元(USD)，显示时使用 $ 符号`;
}
