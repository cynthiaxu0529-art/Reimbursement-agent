/**
 * PATCH /api/reimbursements/[id]/items/[itemId]/adjust-category
 *
 * 财务专用：调整已审批报销单的费用类别及会计入账科目。
 * 仅限 finance / super_admin 角色操作。
 * 适用状态：approved / processing / paid / reversed。
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, reimbursementItems, users, departments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserRoles } from '@/lib/auth/roles';
import { apiError } from '@/lib/api-error';
import { mapExpenseToAccount } from '@/lib/accounting/expense-account-mapping';
import {
  ensureAccountsSynced,
  getAccountName,
  isKnownAccountCode,
} from '@/lib/accounting/chart-of-accounts-sync';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string; itemId: string }> };

/** 允许财务调整科目的报销单状态 */
const ADJUSTABLE_STATUSES = ['approved', 'processing', 'paid', 'reversed'];

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, itemId } = await params;

    // ---- 认证 ----
    const session = await auth();
    if (!session?.user) {
      return apiError('未登录', 401);
    }

    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });
    if (!currentUser) {
      return apiError('用户不存在', 401);
    }

    // ---- 财务权限校验 ----
    const userRoles = getUserRoles(currentUser);
    const hasFinanceAccess = userRoles.some((r) =>
      ['finance', 'super_admin'].includes(r)
    );
    if (!hasFinanceAccess) {
      return apiError('需要财务权限才能调整入账科目', 403);
    }

    // ---- 查询报销单 ----
    const reimbursement = await db.query.reimbursements.findFirst({
      where: eq(reimbursements.id, id),
      with: { items: true },
    });

    if (!reimbursement) {
      return apiError('报销单不存在', 404);
    }

    // 同租户校验
    if (
      currentUser.tenantId &&
      reimbursement.tenantId !== currentUser.tenantId
    ) {
      return apiError('无权操作此报销单', 403);
    }

    // 状态校验：只允许对已完成审批流程的单据调整科目
    if (!ADJUSTABLE_STATUSES.includes(reimbursement.status)) {
      return apiError(
        `只能对已审批的报销单调整入账科目（当前状态：${reimbursement.status}）`,
        400
      );
    }

    // ---- 查找明细行 ----
    const item = reimbursement.items.find((i) => i.id === itemId);
    if (!item) {
      return apiError('费用明细不存在', 404);
    }

    // ---- 解析请求体 ----
    const body = await request.json();
    const { category, coaCode, coaName } = body as {
      category?: string;
      coaCode?: string;
      coaName?: string;
    };

    if (!category) {
      return apiError('请提供新的费用类别 (category)', 400);
    }

    // Make sure synced_accounts is warm before we validate / look up names.
    await ensureAccountsSynced();

    // Build department context so the derived code respects R&D / S&M / G&A split.
    const owner = await db.query.users.findFirst({
      where: eq(users.id, reimbursement.userId),
      columns: { department: true, departmentId: true },
    });
    let costCenter: string | null = null;
    let departmentName: string | null = owner?.department || null;
    if (owner?.departmentId) {
      const dept = await db.query.departments.findFirst({
        where: eq(departments.id, owner.departmentId),
        columns: { name: true, costCenter: true },
      });
      if (dept) {
        departmentName = dept.name;
        costCenter = dept.costCenter ?? null;
      }
    }

    let finalCoaCode: string | null = coaCode ?? null;
    let finalCoaName: string | null = coaName ?? null;

    if (finalCoaCode) {
      // Explicit code supplied — must exist in canonical CoA or we reject up-front.
      // Legacy dot-notation (6601.09 etc.) is no longer part of the canonical list
      // and will be rejected here, which is the point.
      if (!(await isKnownAccountCode(finalCoaCode))) {
        return apiError(
          `科目代码 ${finalCoaCode} 不在最新的 Chart of Accounts 中，请从同步后的科目表中选择`,
          400,
        );
      }
      if (!finalCoaName) {
        finalCoaName = await getAccountName(finalCoaCode);
      }
    } else {
      // Derive via canonical mapper — produces codes that already match the CoA
      // and applies the Mapping conventions (company-wide SaaS / Web3 / GPU / AI
      // APIs / S&M KOL & 红包).
      const mapping = await mapExpenseToAccount(
        category,
        item.description || '',
        costCenter,
        departmentName,
      );
      finalCoaCode = mapping.accountCode;
      finalCoaName = mapping.accountName;
    }

    // ---- 更新明细行 ----
    // Track previous COA values for sync duplicate prevention
    const now = new Date();
    const coaChanged = finalCoaCode && finalCoaCode !== item.coaCode;

    const [updated] = await db
      .update(reimbursementItems)
      .set({
        category,
        coaCode: finalCoaCode,
        coaName: finalCoaName,
        // Record previous COA when account code changes (for accounting agent dedup)
        ...(coaChanged && {
          previousCoaCode: item.coaCode || null,
          previousCoaName: item.coaName || null,
          coaChangedAt: now,
        }),
        updatedAt: now,
      })
      .where(eq(reimbursementItems.id, itemId))
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        category: updated.category,
        coaCode: updated.coaCode,
        coaName: updated.coaName,
        previousCategory: item.category,
        previousCoaCode: item.coaCode,
        previousCoaName: item.coaName,
        adjustedBy: currentUser.id,
        adjustedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Adjust category error:', error);
    return apiError('调整入账科目失败', 500);
  }
}
