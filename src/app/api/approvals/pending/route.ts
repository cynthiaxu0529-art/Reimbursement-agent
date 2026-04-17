/**
 * 待审批报销单列表 API
 *
 * GET /api/approvals/pending - 获取当前用户作为审批人的待审批报销单
 *
 * 支持 Session 和 API Key 认证
 * API Key 需要 scope: approval:read
 *
 * 匹配规则：直接指定 approverId = userId，或角色匹配 approverRole IN (userRoles)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth/api-key';
import { db } from '@/lib/db';
import { reimbursements, approvalChain, users } from '@/lib/db/schema';
import { eq, and, inArray, or, isNull } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const authResult = await authenticate(request, 'approval:read' as any);
  if (!authResult.success) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      { status: authResult.statusCode }
    );
  }

  const { context } = authResult;

  try {
    // 获取用户角色和部门，用于匹配基于角色的审批步骤
    const userRoles = context.user.roles || (context.user.role ? [context.user.role] : []);

    // Session 认证的 context 里没有 departmentId，从数据库补查
    let userDepartmentId = (context.user as { departmentId?: string }).departmentId;
    if (userDepartmentId === undefined) {
      const current = await db.query.users.findFirst({
        where: eq(users.id, context.userId),
        columns: { departmentId: true },
      });
      userDepartmentId = current?.departmentId || undefined;
    }

    // 角色匹配时，若步骤绑定了部门，审批人必须属于同部门
    const roleMatchCondition = userRoles.length > 0
      ? and(
          inArray(approvalChain.approverRole, userRoles),
          userDepartmentId
            ? or(
                isNull(approvalChain.departmentId),
                eq(approvalChain.departmentId, userDepartmentId)
              )
            : isNull(approvalChain.departmentId)
        )
      : undefined;

    const approverCondition = roleMatchCondition
      ? or(
          eq(approvalChain.approverId, context.userId),
          roleMatchCondition
        )
      : eq(approvalChain.approverId, context.userId);

    const pendingSteps = await db
      .select({
        chainId: approvalChain.id,
        reimbursementId: approvalChain.reimbursementId,
        stepOrder: approvalChain.stepOrder,
        stepType: approvalChain.stepType,
        stepName: approvalChain.stepName,
        assignedAt: approvalChain.assignedAt,
      })
      .from(approvalChain)
      .where(
        and(
          eq(approvalChain.status, 'pending'),
          approverCondition
        )
      );

    if (pendingSteps.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { total: 0 },
      });
    }

    // 获取关联的报销单（仅 pending 或 under_review 状态）
    const reimbursementIds = [...new Set(pendingSteps.map((s) => s.reimbursementId))];

    const pendingReimbursements = await db
      .select({
        id: reimbursements.id,
        title: reimbursements.title,
        description: reimbursements.description,
        totalAmount: reimbursements.totalAmount,
        totalAmountInBaseCurrency: reimbursements.totalAmountInBaseCurrency,
        baseCurrency: reimbursements.baseCurrency,
        status: reimbursements.status,
        userId: reimbursements.userId,
        submittedAt: reimbursements.submittedAt,
        createdAt: reimbursements.createdAt,
      })
      .from(reimbursements)
      .where(
        and(
          inArray(reimbursements.id, reimbursementIds),
          or(
            eq(reimbursements.status, 'pending'),
            eq(reimbursements.status, 'under_review')
          )
        )
      );

    // 获取提交人信息
    const submitterIds = [...new Set(pendingReimbursements.map((r) => r.userId))];
    const submitters = submitterIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, submitterIds))
      : [];

    const submitterMap = new Map(submitters.map((s) => [s.id, s]));

    // 组装结果
    const now = new Date();
    const data = pendingReimbursements.map((r) => {
      const submitter = submitterMap.get(r.userId);
      const step = pendingSteps.find((s) => s.reimbursementId === r.id);
      const submittedDate = r.submittedAt || r.createdAt;
      const waitingDays = Math.floor(
        (now.getTime() - submittedDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        id: r.id,
        title: r.title,
        description: r.description,
        totalAmount: r.totalAmount,
        totalAmountInBaseCurrency: r.totalAmountInBaseCurrency,
        baseCurrency: r.baseCurrency,
        status: r.status,
        submittedAt: submittedDate.toISOString(),
        waitingDays,
        submitter: submitter
          ? { id: submitter.id, name: submitter.name, email: submitter.email }
          : null,
        approvalStep: step
          ? {
              stepOrder: step.stepOrder,
              stepType: step.stepType,
              stepName: step.stepName,
              assignedAt: step.assignedAt.toISOString(),
            }
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      data,
      meta: { total: data.length },
    });
  } catch (error) {
    console.error('[Approvals] Error fetching pending approvals:', error);
    return NextResponse.json(
      { success: false, error: '获取待审批列表失败' },
      { status: 500 }
    );
  }
}
