import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, reimbursementItems, users, payments, approvalChain } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { createPaymentService } from '@/lib/mcp/fluxpay-client';
import {
  generateApprovalChain,
  processApprovalAction,
  getApprovalChain,
  canUserApprove,
} from '@/lib/approval/approval-chain-service';

// 强制动态渲染，避免构建时预渲染
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/reimbursements/[id] - 获取报销详情
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    // 验证 ID 格式
    if (!id || typeof id !== 'string' || id.length < 10) {
      return NextResponse.json({ error: '无效的报销单ID' }, { status: 400 });
    }

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 先查找报销单（不限制用户，因为审批人也需要查看）
    const reimbursement = await db.query.reimbursements.findFirst({
      where: eq(reimbursements.id, id),
      with: {
        items: true,
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            department: true,
          },
        },
      },
    });

    if (!reimbursement) {
      return NextResponse.json({ error: '报销单不存在' }, { status: 404 });
    }

    // 检查权限：必须是自己的报销或同一租户（审批人）
    const isOwner = reimbursement.userId === session.user.id;
    const isSameTenant = session.user.tenantId && reimbursement.tenantId === session.user.tenantId;

    if (!isOwner && !isSameTenant) {
      return NextResponse.json({ error: '无权查看此报销单' }, { status: 403 });
    }

    // 获取审批链
    let approvalChainData = null;
    try {
      approvalChainData = await getApprovalChain(id);
    } catch {
      // 审批链可能不存在（旧的报销单）
    }

    // 检查当前用户是否可以审批
    let canApprove = false;
    try {
      canApprove = await canUserApprove(id, session.user.id);
    } catch {
      // 忽略错误
    }

    // 获取驳回人信息（如果有）
    let rejector = null;
    if (reimbursement.rejectedBy) {
      const rejectorUser = await db.query.users.findFirst({
        where: eq(users.id, reimbursement.rejectedBy),
        columns: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      });
      if (rejectorUser) {
        rejector = {
          name: rejectorUser.name,
          email: rejectorUser.email,
          role: rejectorUser.role,
        };
      }
    }

    // Transform data to include submitter info
    const transformedData = {
      ...reimbursement,
      submitter: reimbursement.user ? {
        name: reimbursement.user.name,
        email: reimbursement.user.email,
        avatar: reimbursement.user.avatar,
        department: reimbursement.user.department,
      } : undefined,
      user: undefined, // Remove the raw user object
      approvalChain: approvalChainData,
      canApprove,
      rejector,
    };

    return NextResponse.json({
      success: true,
      data: transformedData,
    });
  } catch (error) {
    console.error('Get reimbursement error:', error);
    return NextResponse.json(
      { error: '获取报销详情失败' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/reimbursements/[id] - 更新报销单
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 检查报销单是否存在且属于当前用户
    const existing = await db.query.reimbursements.findFirst({
      where: and(
        eq(reimbursements.id, id),
        eq(reimbursements.userId, session.user.id)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: '报销单不存在' }, { status: 404 });
    }

    const body = await request.json();
    const { title, description, items, status: newStatus, totalAmountInBaseCurrency } = body;

    // 验证状态转换
    const allowedTransitions: Record<string, string[]> = {
      draft: ['pending'],      // 草稿可以提交
      pending: ['draft'],      // 待审批可以撤回
      rejected: ['draft', 'pending'],  // 被驳回可以撤回为草稿或直接重新提交
    };

    // 如果有状态变更请求
    if (newStatus && newStatus !== existing.status) {
      if (!allowedTransitions[existing.status]?.includes(newStatus)) {
        return NextResponse.json(
          { error: `无法从 ${existing.status} 状态转换为 ${newStatus}` },
          { status: 400 }
        );
      }
    } else if (existing.status !== 'draft' && existing.status !== 'rejected') {
      // 如果不是状态变更，只有草稿或被驳回状态可以编辑内容
      return NextResponse.json(
        { error: '只有草稿或已驳回状态的报销单可以编辑' },
        { status: 400 }
      );
    }

    // 计算原币总金额
    const totalAmount = items?.reduce(
      (sum: number, item: any) => sum + (parseFloat(item.amount) || 0),
      0
    ) || existing.totalAmount;

    // 计算美元总金额
    const usdTotal = totalAmountInBaseCurrency || items?.reduce(
      (sum: number, item: any) => sum + (item.amountInBaseCurrency || parseFloat(item.amount) || 0),
      0
    ) || existing.totalAmountInBaseCurrency;

    // 确定新状态
    let finalStatus = existing.status;
    let submittedAt: Date | null = existing.submittedAt;
    let clearRejection = false;

    if (newStatus === 'pending') {
      finalStatus = 'pending';
      submittedAt = new Date();
      // 如果从 rejected 重新提交，清除拒绝信息
      if (existing.status === 'rejected') {
        clearRejection = true;
      }
    } else if (newStatus === 'draft') {
      finalStatus = 'draft';
      // 撤回时清除提交时间
      submittedAt = null;
      // 如果从 rejected 改为 draft，也清除拒绝信息
      if (existing.status === 'rejected') {
        clearRejection = true;
      }
    }

    // 更新报销单
    const updateData: Record<string, unknown> = {
      title: title || existing.title,
      description: description ?? existing.description,
      totalAmount,
      totalAmountInBaseCurrency: usdTotal,
      baseCurrency: 'USD',
      status: finalStatus,
      submittedAt: submittedAt,
      updatedAt: new Date(),
    };

    // 如果是从 rejected 重新提交，清除拒绝信息
    if (clearRejection) {
      updateData.rejectedAt = null;
      updateData.rejectedBy = null;
      updateData.rejectReason = null;
    }

    const [updated] = await db
      .update(reimbursements)
      .set(updateData)
      .where(eq(reimbursements.id, id))
      .returning();

    // 如果有新的费用明细，删除旧的并创建新的
    if (items && items.length > 0) {
      await db
        .delete(reimbursementItems)
        .where(eq(reimbursementItems.reimbursementId, id));

      await db.insert(reimbursementItems).values(
        items.map((item: any) => ({
          reimbursementId: id,
          category: item.category,
          description: item.description || '',
          amount: parseFloat(item.amount) || 0,
          currency: item.currency || 'CNY',
          amountInBaseCurrency: item.amountInBaseCurrency || parseFloat(item.amount) || 0,
          date: new Date(item.date),
          location: item.location || null,
          vendor: item.vendor || null,
          receiptUrl: item.receiptUrl || null,
        }))
      );
    }

    // 如果提交报销单，生成审批链
    let generatedChain = null;
    if (newStatus === 'pending' && existing.tenantId) {
      try {
        // 删除旧的审批链（如果有）
        await db
          .delete(approvalChain)
          .where(eq(approvalChain.reimbursementId, id));

        // 获取费用类别列表
        const categories = items?.map((item: any) => item.category) || [];

        // 生成新的审批链
        generatedChain = await generateApprovalChain({
          reimbursementId: id,
          userId: session.user.id,
          tenantId: existing.tenantId,
          totalAmount: usdTotal,
          categories,
        });
      } catch (error) {
        console.error('生成审批链失败:', error);
        // 即使审批链生成失败，也继续提交（使用默认审批流程）
      }
    }

    return NextResponse.json({
      success: true,
      data: updated,
      approvalChain: generatedChain,
    });
  } catch (error) {
    console.error('Update reimbursement error:', error);
    return NextResponse.json(
      { error: '更新报销单失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/reimbursements/[id] - 删除报销单
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 检查报销单是否存在且属于当前用户
    const existing = await db.query.reimbursements.findFirst({
      where: and(
        eq(reimbursements.id, id),
        eq(reimbursements.userId, session.user.id)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: '报销单不存在' }, { status: 404 });
    }

    // 只有草稿和已拒绝状态可以删除
    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      return NextResponse.json(
        { error: '只有草稿或已拒绝状态的报销单可以删除' },
        { status: 400 }
      );
    }

    // 删除费用明细
    await db
      .delete(reimbursementItems)
      .where(eq(reimbursementItems.reimbursementId, id));

    // 删除报销单
    await db
      .delete(reimbursements)
      .where(eq(reimbursements.id, id));

    return NextResponse.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    console.error('Delete reimbursement error:', error);
    return NextResponse.json(
      { error: '删除报销单失败' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/reimbursements/[id] - 更新报销单状态（用于审批）
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { status: newStatus, rejectReason, comment, useApprovalChain } = body;

    // 查找报销单
    const existing = await db.query.reimbursements.findFirst({
      where: eq(reimbursements.id, id),
    });

    if (!existing) {
      return NextResponse.json({ error: '报销单不存在' }, { status: 404 });
    }

    // 检查权限：必须是同一租户（审批人）
    if (existing.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: '无权操作此报销单' }, { status: 403 });
    }

    // 检查是否存在审批链
    const existingChain = await db.query.approvalChain.findMany({
      where: eq(approvalChain.reimbursementId, id),
      orderBy: [asc(approvalChain.stepOrder)],
    });

    // 如果存在审批链且请求使用审批链，使用多级审批逻辑
    if (existingChain.length > 0 && (useApprovalChain !== false) && (newStatus === 'approved' || newStatus === 'rejected')) {
      try {
        const action = newStatus === 'approved' ? 'approve' : 'reject';
        const result = await processApprovalAction(
          id,
          session.user.id,
          action,
          comment || rejectReason
        );

        // 获取更新后的报销单
        const updated = await db.query.reimbursements.findFirst({
          where: eq(reimbursements.id, id),
        });

        // 如果所有审批都通过，自动发起支付
        let paymentResult = null;
        if (result.completed && result.approved && updated) {
          paymentResult = await triggerPayment(updated, existing.userId);
        }

        // 获取最新的审批链
        const updatedChain = await getApprovalChain(id);

        return NextResponse.json({
          success: true,
          data: updated,
          approvalChain: updatedChain,
          approvalResult: result,
          payment: paymentResult,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '审批操作失败';
        return NextResponse.json({ error: errorMessage }, { status: 400 });
      }
    }

    // 传统审批流程（无审批链）
    const validTransitions: Record<string, string[]> = {
      pending: ['approved', 'rejected', 'under_review'],
      under_review: ['approved', 'rejected'],
      approved: ['rejected', 'processing'],  // 财务可以拒绝已批准的报销单
      processing: ['rejected', 'approved'],  // 打款失败后可以退回或重试（恢复为 approved）
      draft: ['pending'],
    };

    if (!validTransitions[existing.status]?.includes(newStatus)) {
      return NextResponse.json(
        { error: `无法从 ${existing.status} 状态转换为 ${newStatus}` },
        { status: 400 }
      );
    }

    // 更新报销单状态
    const updateData: Record<string, unknown> = {
      status: newStatus,
      updatedAt: new Date(),
    };

    if (newStatus === 'approved') {
      updateData.approvedAt = new Date();
      updateData.approvedBy = session.user.id;
    } else if (newStatus === 'rejected') {
      updateData.rejectedAt = new Date();
      updateData.rejectedBy = session.user.id;
      if (rejectReason) {
        updateData.rejectReason = rejectReason;
      }
    }

    const [updated] = await db
      .update(reimbursements)
      .set(updateData)
      .where(eq(reimbursements.id, id))
      .returning();

    // 如果审批通过，自动发起支付
    let paymentResult = null;
    if (newStatus === 'approved') {
      paymentResult = await triggerPayment(updated, existing.userId);
    }

    return NextResponse.json({
      success: true,
      data: updated,
      payment: paymentResult,
    });
  } catch (error) {
    console.error('Update reimbursement status error:', error);
    return NextResponse.json(
      { error: '更新报销单状态失败' },
      { status: 500 }
    );
  }
}

/**
 * 触发 FluxPay 支付
 */
async function triggerPayment(reimbursement: any, userId: string) {
  try {
    // 获取用户银行账户信息
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return { success: false, error: '用户不存在' };
    }

    // 检查是否配置了 FluxPay
    if (!process.env.FLUXPAY_API_KEY) {
      console.log('FluxPay not configured, skipping automatic payment');
      return { success: false, error: 'FluxPay 未配置' };
    }

    // 检查用户钱包地址（FluxPay 使用 Base 链）
    const walletInfo = user.bankAccount as {
      walletAddress?: string;
      chain?: string;
    } | null;

    if (!walletInfo?.walletAddress) {
      console.log('User wallet not configured, skipping payment');
      return {
        success: false,
        error: '用户未配置钱包地址',
        message: '请在个人设置中添加 Base 链钱包地址',
      };
    }

    // 创建支付请求（FluxPay Base 链）
    const paymentService = createPaymentService();
    const result = await paymentService.processReimbursementPayment(
      reimbursement.id,
      userId,
      reimbursement.totalAmount,
      reimbursement.baseCurrency || 'USD', // FluxPay on Base uses stablecoins
      {
        name: user.name || 'User',
        walletAddress: walletInfo.walletAddress,
        chain: walletInfo.chain || 'base',
      },
      `报销付款 - ${reimbursement.title}`
    );

    // 记录支付请求
    if (result.transactionId) {
      await db.insert(payments).values({
        reimbursementId: reimbursement.id,
        amount: reimbursement.totalAmount,
        currency: reimbursement.baseCurrency || 'CNY',
        transactionId: result.transactionId,
        status: result.status,
        paymentProvider: 'fluxpay',
      });

      // 更新报销单状态为处理中
      await db
        .update(reimbursements)
        .set({ status: 'processing' })
        .where(eq(reimbursements.id, reimbursement.id));
    }

    return {
      success: result.success,
      transactionId: result.transactionId,
      status: result.status,
      message: result.success ? '支付已发起' : result.error?.message,
    };
  } catch (error) {
    console.error('Trigger payment error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '支付发起失败',
    };
  }
}
