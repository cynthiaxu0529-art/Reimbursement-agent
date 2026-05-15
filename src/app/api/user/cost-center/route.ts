/**
 * GET /api/user/cost-center
 *
 * 返回当前登录用户的 cost center（rd / sm / ga，来自 departments.cost_center），
 * 给前端类目下拉用：员工的报销条目应展示其部门对应 subtype 的 GL 科目。
 *
 * 退路：
 *  - departments.cost_center 为空时，按部门名做关键字推断（与服务端
 *    `classifyDepartment` 一致）。
 *  - 用户无部门 / 无登录信息时返回 `null`，前端继续按 canonical_codes
 *    优先级取第一个（旧行为，不会变 wrose）。
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, departments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { classifyDepartment } from '@/lib/accounting/expense-account-mapping';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { id: true, departmentId: true, department: true },
    });

    if (!user) {
      return NextResponse.json({ costCenter: null, departmentName: null });
    }

    let costCenter: string | null = null;
    let departmentName: string | null = user.department ?? null;

    if (user.departmentId) {
      const dept = await db.query.departments.findFirst({
        where: eq(departments.id, user.departmentId),
        columns: { name: true, costCenter: true },
      });
      if (dept) {
        departmentName = dept.name;
        costCenter = dept.costCenter ?? null;
      }
    }

    // 显式没设的部门：用服务端同一套关键字推断兜底
    if (!costCenter) {
      costCenter = classifyDepartment(null, departmentName);
    }

    return NextResponse.json({
      costCenter,         // 'rd' | 'sm' | 'ga' (always set after fallback)
      departmentName,
    });
  } catch (err) {
    console.error('[/api/user/cost-center] error:', err);
    return NextResponse.json({ costCenter: null, departmentName: null });
  }
}
