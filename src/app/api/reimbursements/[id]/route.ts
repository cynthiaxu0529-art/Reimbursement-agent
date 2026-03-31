import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, reimbursementItems, users, payments, approvalChain, tenants, departments } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { createPaymentService } from '@/lib/mcp/fluxpay-client';
import {
  generateApprovalChain,
  processApprovalAction,
  getApprovalChain,
  canUserApprove,
} from '@/lib/approval/approval-chain-service';
import { getUserRoles } from '@/lib/auth/roles';
import { canViewReimbursement } from '@/lib/department/department-service';
import { apiError } from '@/lib/api-error';
import { authenticate, logAgentAction } from '@/lib/auth/api-key';
import { API_SCOPES } from '@/lib/auth/scopes';
import { exchangeRateService, loadMonthlyRatesFromDB } from '@/lib/currency/exchange-service';
import { mapExpenseToAccount } from '@/lib/accounting/expense-account-mapping';
import type { CurrencyType } from '@/types';

// 强制动态渲染，避免构建时预渲染
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/reimbursements/[id] - 获取报销详情
 * 支持双重认证：Session（浏览器）+ API Key（Agent/M2M）
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    // 验证 ID 格式
    if (!id || typeof id !== 'string' || id.length < 10) {
      return apiError('无效的报销单ID', 400);
    }

    // 统一认证（支持 Session 和 API Key）
    const authResult = await authenticate(request, API_SCOPES.REIMBURSEMENT_READ);
    if (!authResult.success) {
      return apiError(authResult.error, authResult.statusCode);
    }
    const authCtx = authResult.context;

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
      return apiError('报销单不存在', 404);
    }

    // 检查权限：Agent 只能查看自己的报销单
    const isOwner = reimbursement.userId === authCtx.userId;

    if (authCtx.authType === 'api_key' && !isOwner) {
      return apiError('Agent 只能查看自己的报销单', 403);
    }

    if (!isOwner) {
      // 不是自己的报销，需要检查部门级权限
      const isSameTenant = authCtx.tenantId && reimbursement.tenantId === authCtx.tenantId;

      if (!isSameTenant) {
        return apiError('无权查看此报销单', 403);
      }

      // 获取当前用户完整信息和角色
      const currentUser = await db.query.users.findFirst({
        where: eq(users.id, authCtx.userId),
      });

      if (!currentUser) {
        return apiError('用户不存在', 404);
      }

      const userRoles = getUserRoles(currentUser);

      // 检查是否有权限查看该报销单（部门级数据隔离）
      const canView = await canViewReimbursement(
        authCtx.userId,
        reimbursement.userId,
        id,
        reimbursement.tenantId,
        userRoles
      );

      if (!canView) {
        return apiError('无权查看此报销单，该报销不在您管理的部门范围内', 403);
      }
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
      canApprove = await canUserApprove(id, authCtx.userId);
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
    return apiError('获取报销详情失败', 500);
  }
}

/**
 * PUT /api/reimbursements/[id] - 更新报销单
 * 支持双重认证：Session（浏览器）+ API Key（Agent/M2M）
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    // 统一认证（支持 Session 和 API Key）
    const authResult = await authenticate(request, API_SCOPES.REIMBURSEMENT_UPDATE);
    if (!authResult.success) {
      return apiError(authResult.error, authResult.statusCode);
    }
    const authCtx = authResult.context;

    // 检查报销单是否存在且属于当前用户
    const existing = await db.query.reimbursements.findFirst({
      where: and(
        eq(reimbursements.id, id),
        eq(reimbursements.userId, authCtx.userId)
      ),
    });

    if (!existing) {
      return apiError('报销单不存在', 404);
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
        return apiError(`无法从 ${existing.status} 状态转换为 ${newStatus}`, 400, 'INVALID_STATUS_TRANSITION');
      }
    } else if (existing.status !== 'draft' && existing.status !== 'rejected') {
      // 如果不是状态变更，只有草稿或被驳回状态可以编辑内容
      return apiError('只有草稿或已驳回状态的报销单可以编辑', 400, 'INVALID_STATUS_TRANSITION');
    }

    // 获取租户本位币
    let tenantBaseCurrency = existing.baseCurrency || 'USD';
    if (existing.tenantId) {
      const tenantRecord = await db.query.tenants.findFirst({
        where: eq(tenants.id, existing.tenantId),
        columns: { baseCurrency: true },
      });
      if (tenantRecord?.baseCurrency) {
        tenantBaseCurrency = tenantRecord.baseCurrency;
      }
    }

    // 服务端汇率转换：如果 item 缺少 exchangeRate / amountInBaseCurrency，自动转换
    if (items && items.length > 0) {
      await loadMonthlyRatesFromDB();

      for (const item of items) {
        const itemCurrency = (item.currency || 'CNY') as CurrencyType;
        const itemAmount = parseFloat(item.amount) || 0;

        if (itemCurrency === tenantBaseCurrency) {
          item.exchangeRate = item.exchangeRate || 1;
          item.amountInBaseCurrency = item.amountInBaseCurrency || itemAmount;
          continue;
        }

        if (item.exchangeRate && item.amountInBaseCurrency && item.amountInBaseCurrency !== itemAmount) {
          continue;
        }

        try {
          const conversion = await exchangeRateService.convert({
            amount: itemAmount,
            fromCurrency: itemCurrency,
            toCurrency: tenantBaseCurrency as CurrencyType,
          });
          item.exchangeRate = conversion.exchangeRate;
          item.amountInBaseCurrency = conversion.convertedAmount;
        } catch (err) {
          console.warn(`Exchange rate conversion failed for ${itemCurrency} → ${tenantBaseCurrency}:`, err);
          item._conversionFailed = true;
        }
      }

      // 安全网：强制校验所有非本位币的 item 已正确转换
      for (const item of items) {
        const itemCurrency = (item.currency || 'CNY') as CurrencyType;
        const itemAmount = parseFloat(item.amount) || 0;
        if (itemCurrency === tenantBaseCurrency || itemAmount === 0) continue;

        const baseCurrencyAmount = parseFloat(item.amountInBaseCurrency) || 0;
        const notConverted = item._conversionFailed ||
          baseCurrencyAmount === 0 ||
          (baseCurrencyAmount > 0 && Math.abs(baseCurrencyAmount - itemAmount) / itemAmount < 0.01);

        if (notConverted) {
          console.warn(`[CurrencyFix] PUT: ${itemCurrency} ${itemAmount} not converted to ${tenantBaseCurrency}, forcing re-conversion`);
          try {
            const conversion = await exchangeRateService.convert({
              amount: itemAmount,
              fromCurrency: itemCurrency,
              toCurrency: tenantBaseCurrency as CurrencyType,
            });
            item.exchangeRate = conversion.exchangeRate;
            item.amountInBaseCurrency = conversion.convertedAmount;
          } catch {
            const fallbackRates: Record<string, number> = { CNY: 0.138, EUR: 1.08, GBP: 1.27, JPY: 0.0067, HKD: 0.128, SGD: 0.74, AUD: 0.65, CAD: 0.73, KRW: 0.00073 };
            const fallbackRate = fallbackRates[itemCurrency] || 0.15;
            item.exchangeRate = fallbackRate;
            item.amountInBaseCurrency = Math.round(itemAmount * fallbackRate * 100) / 100;
          }
        }
      }
    }

    // 计算原币总金额
    const totalAmount = items?.reduce(
      (sum: number, item: any) => sum + (parseFloat(item.amount) || 0),
      0
    ) || existing.totalAmount;

    // 计算本位币总金额
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
      baseCurrency: tenantBaseCurrency,
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

    // 如果有新的费用明细，先做校验，再删除旧的并创建新的
    if (items && items.length > 0) {
      // 保留旧 items 的 receiptUrl，用于在新 items 缺失时自动回填
      const oldItems = await db.query.reimbursementItems.findMany({
        where: eq(reimbursementItems.reimbursementId, id),
      });
      const oldReceiptMap = new Map<string, string>();
      for (const old of oldItems) {
        if (old.receiptUrl) {
          const key = `${old.category}_${old.amount}_${old.date?.toISOString?.()?.split('T')[0] || ''}`;
          oldReceiptMap.set(key, old.receiptUrl);
        }
      }

      // 预检查：尝试回填 receiptUrl 后，仍然缺失的 items
      const missingReceiptItems: string[] = [];
      for (const item of items) {
        let hasReceipt = !!item.receiptUrl;
        if (!hasReceipt) {
          const matchKey = `${item.category}_${parseFloat(item.amount) || 0}_${item.date?.split?.('T')[0] || item.date || ''}`;
          hasReceipt = oldReceiptMap.has(matchKey);
        }
        if (!hasReceipt) {
          missingReceiptItems.push(`${item.category}: ${item.description || item.amount}`);
        }
      }
      if (missingReceiptItems.length > 0) {
        return apiError(
          `以下费用项缺少凭证附件（receiptUrl），请先上传凭证再提交：${missingReceiptItems.join('、')}`,
          400,
          'MISSING_RECEIPT',
        );
      }

      // 检查重复费用项
      const itemKeys = items.map((item: any) =>
        `${item.category}_${parseFloat(item.amount) || 0}_${item.date}`
      );
      const duplicateKeys = itemKeys.filter((key: string, idx: number) => itemKeys.indexOf(key) !== idx);
      if (duplicateKeys.length > 0) {
        const dupes = (Array.from(new Set(duplicateKeys)) as string[]).map((k) => {
          const parts = k.split('_');
          return `${parts[0]}: ${parts[1]} (${parts[2]})`;
        });
        return apiError(
          `发现重复费用项（类别+金额+日期相同），请确认是否误传：${dupes.join('、')}`,
          400,
          'DUPLICATE_ITEMS',
        );
      }

      // 校验通过，执行替换
      await db
        .delete(reimbursementItems)
        .where(eq(reimbursementItems.reimbursementId, id));

      const parseDate = (dateStr: string): Date => {
        if (!dateStr) return new Date();
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d;
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }
        return new Date();
      };

      await db.insert(reimbursementItems).values(
        items.map((item: any) => {
          // 如果新 item 没有 receiptUrl，尝试从旧 items 中回填
          let receiptUrl = item.receiptUrl || null;
          if (!receiptUrl) {
            const matchKey = `${item.category}_${parseFloat(item.amount) || 0}_${item.date?.split?.('T')[0] || item.date || ''}`;
            receiptUrl = oldReceiptMap.get(matchKey) || null;
            if (receiptUrl) {
              console.log(`[PUT] Auto-recovered receiptUrl for item: ${item.category} ${item.amount} ${item.date}`);
            }
          }
          if (!receiptUrl) {
            missingReceiptItems.push(`${item.category}: ${item.description || item.amount}`);
          }

          const itemData: any = {
            reimbursementId: id,
            category: item.category,
            description: item.description || '',
            amount: parseFloat(item.amount) || 0,
            currency: item.currency || 'CNY',
            exchangeRate: item.exchangeRate || null,
            amountInBaseCurrency: item.amountInBaseCurrency || parseFloat(item.amount) || 0,
            date: new Date(item.date),
            location: item.location || null,
            vendor: item.vendor || null,
            receiptUrl,
            invoiceNumber: item.invoiceNumber || null,
          };
          // Hotel-specific fields
          if (item.checkInDate) {
            itemData.checkInDate = parseDate(item.checkInDate);
          }
          if (item.checkOutDate) {
            itemData.checkOutDate = parseDate(item.checkOutDate);
          }
          // 兼容 quantity 字段：Bot 可能传 quantity+unit 而非 nights
          if (item.category === 'hotel' && !item.nights && item.quantity && parseInt(item.quantity) > 0) {
            const unit = (item.unit || '').toLowerCase();
            if (!unit || unit === '晚' || unit === '天' || unit === 'night' || unit === 'nights' || unit === 'day' || unit === 'days') {
              item.nights = parseInt(item.quantity);
            }
          }
          if (item.nights) {
            itemData.nights = parseInt(item.nights) || null;
          }
          // 服务端补齐酒店住宿天数：如果有 checkInDate/checkOutDate 但缺少 nights，自动计算
          if (item.category === 'hotel' && item.checkInDate && item.checkOutDate && !item.nights) {
            try {
              const ciDate = new Date(item.checkInDate);
              const coDate = new Date(item.checkOutDate);
              const diffDays = Math.ceil((coDate.getTime() - ciDate.getTime()) / (1000 * 60 * 60 * 24));
              if (diffDays > 0) itemData.nights = diffDays;
            } catch {
              // 日期解析失败，不做处理
            }
          }
          return itemData;
        })
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
          userId: authCtx.userId,
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
    return apiError('更新报销单失败', 500);
  }
}

/**
 * DELETE /api/reimbursements/[id] - 删除报销单
 * 支持双重认证：Session（浏览器）+ API Key（Agent/M2M）
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    // 统一认证（支持 Session 和 API Key）
    const authResult = await authenticate(request, API_SCOPES.REIMBURSEMENT_CANCEL);
    if (!authResult.success) {
      return apiError(authResult.error, authResult.statusCode);
    }
    const authCtx = authResult.context;

    // 检查报销单是否存在且属于当前用户
    const existing = await db.query.reimbursements.findFirst({
      where: and(
        eq(reimbursements.id, id),
        eq(reimbursements.userId, authCtx.userId)
      ),
    });

    if (!existing) {
      return apiError('报销单不存在', 404);
    }

    // 只有草稿和已拒绝状态可以删除
    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      return apiError('只有草稿或已拒绝状态的报销单可以删除', 400, 'INVALID_STATUS_TRANSITION');
    }

    // 删除费用明细
    await db
      .delete(reimbursementItems)
      .where(eq(reimbursementItems.reimbursementId, id));

    // 删除审批链记录
    await db
      .delete(approvalChain)
      .where(eq(approvalChain.reimbursementId, id));

    // 删除支付记录（如果有）
    await db
      .delete(payments)
      .where(eq(payments.reimbursementId, id));

    // 删除报销单
    await db
      .delete(reimbursements)
      .where(eq(reimbursements.id, id));

    // Agent 审计日志
    if (authCtx.authType === 'api_key' && authCtx.apiKey) {
      logAgentAction({
        tenantId: authCtx.tenantId!,
        apiKeyId: authCtx.apiKey.id,
        userId: authCtx.userId,
        action: 'reimbursement:delete',
        method: 'DELETE',
        path: `/api/reimbursements/${id}`,
        statusCode: 200,
        agentType: authCtx.apiKey.agentType,
        requestSummary: { reimbursementId: id },
        responseSummary: { deleted: true },
        entityType: 'reimbursement',
        entityId: id,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });
    }

    return NextResponse.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    console.error('Delete reimbursement error:', error);
    return apiError('删除报销单失败', 500);
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
      return apiError('未登录', 401);
    }

    const body = await request.json();
    const { status: newStatus, rejectReason, comment, useApprovalChain } = body;

    // 查找报销单
    const existing = await db.query.reimbursements.findFirst({
      where: eq(reimbursements.id, id),
    });

    if (!existing) {
      return apiError('报销单不存在', 404);
    }

    // 检查权限：必须是同一租户
    if (existing.tenantId !== session.user.tenantId) {
      return apiError('无权操作此报销单', 403);
    }

    // 获取当前用户完整信息和角色
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!currentUser) {
      return apiError('用户不存在', 404);
    }

    const userRoles = getUserRoles(currentUser);

    // 检查部门级数据隔离权限
    const canView = await canViewReimbursement(
      session.user.id,
      existing.userId,
      id,
      existing.tenantId,
      userRoles
    );

    if (!canView) {
      return apiError('无权操作此报销单，该报销不在您管理的部门范围内', 403);
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
        return apiError(errorMessage, 400, 'APPROVAL_FAILED');
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
      return apiError(`无法从 ${existing.status} 状态转换为 ${newStatus}`, 400, 'INVALID_STATUS_TRANSITION');
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

    // 如果审批通过，根据提交人部门的费用性质自动打 account_code 标签
    if (newStatus === 'approved') {
      try {
        // 获取提交人的部门信息（costCenter + 名称）
        const submitter = await db.query.users.findFirst({
          where: eq(users.id, existing.userId),
        });
        let costCenter: string | null = null;
        let deptName: string | null = null;
        if (submitter?.departmentId) {
          const dept = await db.query.departments.findFirst({
            where: eq(departments.id, submitter.departmentId),
          });
          costCenter = dept?.costCenter || null;
          deptName = dept?.name || submitter.department || null;
        } else {
          deptName = submitter?.department || null;
        }

        const items = await db.query.reimbursementItems.findMany({
          where: eq(reimbursementItems.reimbursementId, id),
        });
        for (const item of items) {
          const mapping = await mapExpenseToAccount(item.category, item.description, costCenter, deptName);
          await db.update(reimbursementItems)
            .set({
              coaCode: mapping.accountCode,
              coaName: mapping.accountName,
              updatedAt: new Date(),
            })
            .where(eq(reimbursementItems.id, item.id));
        }
      } catch (err) {
        console.error('Failed to tag account_code on approval:', err);
        // 不阻塞审批流程
      }
    }

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
    return apiError('更新报销单状态失败', 500);
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

    // 创建支付请求（FluxPay Base 链）— 使用本位币金额
    const paymentService = createPaymentService();
    const paymentAmount = reimbursement.totalAmountInBaseCurrency || reimbursement.totalAmount;
    const result = await paymentService.processReimbursementPayment(
      reimbursement.id,
      userId,
      paymentAmount,
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
