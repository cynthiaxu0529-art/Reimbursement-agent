import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { reimbursements, reimbursementItems, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { checkItemsLimit } from '@/lib/policy/limit-service';
import { authenticate, logAgentAction } from '@/lib/auth/api-key';
import { API_SCOPES } from '@/lib/auth/scopes';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string; itemId: string }> };

/**
 * DELETE /api/reimbursements/[id]/items/[itemId] - Delete individual expense item
 * 支持双重认证：Session（浏览器）+ API Key（Agent/M2M）
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id, itemId } = await params;

    // 统一认证（支持 Session 和 API Key）
    const authResult = await authenticate(request, API_SCOPES.REIMBURSEMENT_UPDATE);
    if (!authResult.success) {
      return apiError(authResult.error, authResult.statusCode);
    }
    const authCtx = authResult.context;

    // Check if reimbursement exists and belongs to user
    const existing = await db.query.reimbursements.findFirst({
      where: and(
        eq(reimbursements.id, id),
        eq(reimbursements.userId, authCtx.userId)
      ),
      with: {
        items: true,
      },
    });

    if (!existing) {
      return apiError('报销单不存在', 404);
    }

    // Only allow editing in draft or rejected status
    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      return apiError('只有草稿或已拒绝状态的报销单可以编辑', 400);
    }

    // Check if item exists
    const item = existing.items.find(i => i.id === itemId);
    if (!item) {
      return apiError('费用明细不存在', 404);
    }

    // Don't allow deleting the last item
    if (existing.items.length <= 1) {
      return apiError('至少需要保留一项费用明细', 400);
    }

    // Delete the item
    await db
      .delete(reimbursementItems)
      .where(eq(reimbursementItems.id, itemId));

    // Update total amount
    const remainingItems = existing.items.filter(i => i.id !== itemId);
    const newTotalAmount = remainingItems.reduce(
      (sum, i) => sum + (i.amount || 0),
      0
    );
    const newTotalAmountInBaseCurrency = remainingItems.reduce(
      (sum, i) => sum + (i.amountInBaseCurrency || i.amount || 0),
      0
    );

    await db
      .update(reimbursements)
      .set({
        totalAmount: newTotalAmount,
        totalAmountInBaseCurrency: newTotalAmountInBaseCurrency,
        updatedAt: new Date(),
      })
      .where(eq(reimbursements.id, id));

    // 记录审计日志（API Key 认证时）
    if (authCtx.authType === 'api_key' && authCtx.apiKey) {
      logAgentAction({
        tenantId: authCtx.tenantId || '',
        apiKeyId: authCtx.apiKey.id,
        userId: authCtx.userId,
        action: 'reimbursement:delete_item',
        method: 'DELETE',
        path: `/api/reimbursements/${id}/items/${itemId}`,
        statusCode: 200,
        agentType: authCtx.apiKey.agentType,
        entityType: 'reimbursement_item',
        entityId: itemId,
        requestSummary: { reimbursementId: id, itemId },
      });
    }

    return NextResponse.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    console.error('Delete item error:', error);
    return apiError('删除费用明细失败', 500);
  }
}

/**
 * PATCH /api/reimbursements/[id]/items/[itemId] - Update individual expense item
 * 支持双重认证：Session（浏览器）+ API Key（Agent/M2M）
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id, itemId } = await params;

    // 统一认证（支持 Session 和 API Key）
    const authResult = await authenticate(request, API_SCOPES.REIMBURSEMENT_UPDATE);
    if (!authResult.success) {
      return apiError(authResult.error, authResult.statusCode);
    }
    const authCtx = authResult.context;

    // Check if reimbursement exists and belongs to user
    const existing = await db.query.reimbursements.findFirst({
      where: and(
        eq(reimbursements.id, id),
        eq(reimbursements.userId, authCtx.userId)
      ),
      with: {
        items: true,
      },
    });

    if (!existing) {
      return apiError('报销单不存在', 404);
    }

    // Only allow editing in draft or rejected status
    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      return apiError('只有草稿或已拒绝状态的报销单可以编辑', 400);
    }

    // Check if item exists
    const item = existing.items.find(i => i.id === itemId);
    if (!item) {
      return apiError('费用明细不存在', 404);
    }

    const body = await request.json();
    const { receiptUrl, vendor, description, amount, currency, category, date } = body;

    // 获取用户的租户ID
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, authCtx.userId),
    });

    // Build update object
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    // 用于记录限额调整信息
    let limitAdjustment: { wasAdjusted: boolean; message?: string } = { wasAdjusted: false };

    if (receiptUrl !== undefined) {
      updateData.receiptUrl = receiptUrl;
    }
    if (vendor !== undefined) {
      updateData.vendor = vendor;
    }
    if (description !== undefined) {
      updateData.description = description;
    }
    if (amount !== undefined) {
      let finalAmount = parseFloat(amount) || 0;
      let finalAmountInBaseCurrency = body.amountInBaseCurrency || finalAmount;

      // 应用政策限额约束（支持 per_day 和 per_month）
      const categoryToCheck = category || item.category;
      const dateToCheck = date || item.date;

      if (currentUser?.tenantId) {
        const nightsToCheck = body.nights ? parseInt(body.nights) : (item as any).nights;
        const checkInToCheck = body.checkInDate || (item as any).checkInDate;
        const checkOutToCheck = body.checkOutDate || (item as any).checkOutDate;

        const limitResult = await checkItemsLimit(
          authCtx.userId,
          currentUser.tenantId,
          [{
            category: categoryToCheck,
            amount: finalAmount,
            amountInBaseCurrency: finalAmountInBaseCurrency,
            date: typeof dateToCheck === 'string' ? dateToCheck : dateToCheck?.toISOString(),
            location: body.location || item.location,
            nights: nightsToCheck || undefined,
            checkInDate: checkInToCheck ? (typeof checkInToCheck === 'string' ? checkInToCheck : checkInToCheck.toISOString()) : undefined,
            checkOutDate: checkOutToCheck ? (typeof checkOutToCheck === 'string' ? checkOutToCheck : checkOutToCheck.toISOString()) : undefined,
          }]
        );

        if (limitResult.items[0]?.wasAdjusted) {
          const adjustedUsd = limitResult.items[0].adjustedAmount;
          // 按比例调整原币金额
          if (finalAmountInBaseCurrency > 0) {
            const ratio = adjustedUsd / finalAmountInBaseCurrency;
            finalAmount = finalAmount * ratio;
          }
          finalAmountInBaseCurrency = adjustedUsd;
          limitAdjustment = {
            wasAdjusted: true,
            message: limitResult.messages[0] || '金额已根据政策限额调整',
          };
        }
      }

      updateData.amount = finalAmount;
      updateData.amountInBaseCurrency = finalAmountInBaseCurrency;
    }
    if (currency !== undefined) {
      updateData.currency = currency;
    }
    if (category !== undefined) {
      updateData.category = category;
    }
    if (date !== undefined) {
      updateData.date = new Date(date);
    }

    // Update the item
    const [updated] = await db
      .update(reimbursementItems)
      .set(updateData)
      .where(eq(reimbursementItems.id, itemId))
      .returning();

    // If amount changed, update reimbursement total
    if (amount !== undefined) {
      const allItems = existing.items.map(i =>
        i.id === itemId ? { ...i, amount: updateData.amount, amountInBaseCurrency: updateData.amountInBaseCurrency } : i
      );
      const newTotalAmount = allItems.reduce(
        (sum, i) => sum + (i.amount || 0),
        0
      );
      const newTotalAmountInBaseCurrency = allItems.reduce(
        (sum, i) => sum + (i.amountInBaseCurrency || i.amount || 0),
        0
      );

      await db
        .update(reimbursements)
        .set({
          totalAmount: newTotalAmount,
          totalAmountInBaseCurrency: newTotalAmountInBaseCurrency,
          updatedAt: new Date(),
        })
        .where(eq(reimbursements.id, id));
    }

    // 记录审计日志（API Key 认证时）
    if (authCtx.authType === 'api_key' && authCtx.apiKey) {
      logAgentAction({
        tenantId: authCtx.tenantId || '',
        apiKeyId: authCtx.apiKey.id,
        userId: authCtx.userId,
        action: 'reimbursement:update_item',
        method: 'PATCH',
        path: `/api/reimbursements/${id}/items/${itemId}`,
        statusCode: 200,
        agentType: authCtx.apiKey.agentType,
        entityType: 'reimbursement_item',
        entityId: itemId,
        requestSummary: { reimbursementId: id, itemId, fields: Object.keys(body) },
      });
    }

    const responseData: any = {
      success: true,
      data: updated,
    };

    // 如果金额被调整，返回提示信息
    if (limitAdjustment.wasAdjusted) {
      responseData.limitAdjustment = limitAdjustment;
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Update item error:', error);
    return apiError('更新费用明细失败', 500);
  }
}
