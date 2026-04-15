/**
 * 报销单编号解析 API
 *
 * GET /api/reimbursements/resolve?code=XXX
 *
 * 用于把 UI 上展示的短编号（如 `#86208B80` 或 `#RF-2026-ABCDE`）解析为
 * 真正的报销单 UUID。冲差页的「粘贴报销单 ID」弹窗会用到。
 *
 * 支持的输入格式（大小写、是否带 `#` 都可）：
 *   - 完整 UUID              eg. 86208b80-1234-5678-9abc-def012345678
 *   - 8 位短码（UUID 前 8 位）eg. #86208B80 / 86208b80
 *   - `#RF-YYYY-XXXXX`       eg. #RF-2026-ABCDE  (createdAt 年份 + UUID 后 5 位)
 *
 * 预借款 `#ADV-YYYY-XXXXX` 存在独立的 advances 表，不由本接口解析。
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { reimbursements, users } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { apiError } from '@/lib/api-error';
import { authenticate } from '@/lib/auth/api-key';
import { API_SCOPES } from '@/lib/auth/scopes';
import { getUserRoles } from '@/lib/auth/roles';
import { canViewReimbursement } from '@/lib/department/department-service';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_ID_RE = /^#?([0-9a-f]{8})$/i;
const FORM_ID_RE = /^#?RF-(\d{4})-([0-9a-f]{5})$/i;

export async function GET(request: NextRequest) {
  try {
    const codeRaw = request.nextUrl.searchParams.get('code');
    if (!codeRaw) {
      return apiError('缺少查询参数 code', 400);
    }
    const code = codeRaw.trim();
    if (!code) {
      return apiError('编号不能为空', 400);
    }

    const authResult = await authenticate(request, API_SCOPES.REIMBURSEMENT_READ);
    if (!authResult.success) {
      return apiError(authResult.error, authResult.statusCode);
    }
    const authCtx = authResult.context;

    // 租户隔离：没有租户的会话不允许跨租户查询
    const tenantId = authCtx.tenantId ?? authCtx.user.tenantId;
    if (!tenantId) {
      return apiError('当前用户未绑定租户', 403);
    }

    // ── 分格式匹配 ──
    let candidates: { id: string; userId: string }[] = [];

    if (UUID_RE.test(code)) {
      const row = await db.query.reimbursements.findFirst({
        where: and(
          eq(reimbursements.id, code.toLowerCase()),
          eq(reimbursements.tenantId, tenantId),
        ),
        columns: { id: true, userId: true },
      });
      if (row) candidates = [row];
    } else {
      const short = code.match(SHORT_ID_RE);
      const form = code.match(FORM_ID_RE);

      if (short) {
        const prefix = short[1].toLowerCase();
        // UUID 的前 8 位就是文本化后的前 8 位（不含横杠）
        candidates = await db
          .select({ id: reimbursements.id, userId: reimbursements.userId })
          .from(reimbursements)
          .where(
            and(
              eq(reimbursements.tenantId, tenantId),
              sql`${reimbursements.id}::text LIKE ${`${prefix}%`}`,
            ),
          )
          .limit(5);
      } else if (form) {
        const year = parseInt(form[1], 10);
        const suffix = form[2].toLowerCase();

        candidates = await db
          .select({ id: reimbursements.id, userId: reimbursements.userId })
          .from(reimbursements)
          .where(
            and(
              eq(reimbursements.tenantId, tenantId),
              sql`${reimbursements.id}::text LIKE ${`%${suffix}`}`,
              sql`EXTRACT(YEAR FROM ${reimbursements.createdAt}) = ${year}`,
            ),
          )
          .limit(5);
      } else {
        return apiError(
          '无法识别的报销单编号格式，请粘贴完整 UUID、8 位短码或 #RF-YYYY-XXXXX 格式',
          400,
        );
      }
    }

    if (candidates.length === 0) {
      return apiError('找不到匹配的报销单', 404);
    }
    if (candidates.length > 1) {
      return NextResponse.json(
        {
          success: false,
          error: '编号匹配到多条记录，请使用更完整的 ID',
          ambiguous: true,
          matchCount: candidates.length,
        },
        { status: 409 },
      );
    }

    const matched = candidates[0];

    // 权限校验：沿用 /api/reimbursements/[id] 的规则
    const isOwner = matched.userId === authCtx.userId;
    if (authCtx.authType === 'api_key' && !isOwner) {
      return apiError('Agent 只能查看自己的报销单', 403);
    }
    if (!isOwner) {
      const currentUser = await db.query.users.findFirst({
        where: eq(users.id, authCtx.userId),
      });
      if (!currentUser) {
        return apiError('用户不存在', 404);
      }
      const userRoles = getUserRoles(currentUser);
      const canView = await canViewReimbursement(
        authCtx.userId,
        matched.userId,
        matched.id,
        tenantId,
        userRoles,
      );
      if (!canView) {
        return apiError('无权查看此报销单', 403);
      }
    }

    return NextResponse.json({ success: true, id: matched.id });
  } catch (error) {
    console.error('Resolve reimbursement code error:', error);
    return apiError('解析报销单编号失败', 500);
  }
}
