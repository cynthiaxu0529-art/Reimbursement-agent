/**
 * Skill 详情 API
 * 提供单个 Skill 的查询、更新和删除
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, skills } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getBuiltInSkills } from '@/lib/skills/skill-manager';
import { ADMIN_ROLES } from '@/lib/auth/roles';

/**
 * GET /api/skills/[id]
 * 获取单个 Skill 详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // 先检查是否为内置 Skill
    const builtInSkills = getBuiltInSkills(user.tenantId);
    const builtIn = builtInSkills.find(s => s.id === id);
    if (builtIn) {
      return NextResponse.json({
        success: true,
        data: {
          ...builtIn,
          source: 'builtin',
          createdAt: builtIn.createdAt.toISOString(),
          updatedAt: builtIn.updatedAt.toISOString(),
        },
      });
    }

    // 查询数据库中的自定义 Skill
    const skill = await db.query.skills.findFirst({
      where: and(
        eq(skills.id, id),
        eq(skills.tenantId, user.tenantId),
      ),
    });

    if (!skill) {
      return NextResponse.json({ error: 'Skill 不存在' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...skill,
        source: 'custom',
      },
    });
  } catch (error) {
    console.error('Get skill detail error:', error);
    return NextResponse.json({ error: '获取 Skill 详情失败' }, { status: 500 });
  }
}

/**
 * PUT /api/skills/[id]
 * 更新 Skill
 *
 * 内置 Skill 仅允许修改 isActive 和 config
 * 自定义 Skill 允许修改所有字段
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    if (!ADMIN_ROLES.includes(user.role as any)) {
      return NextResponse.json({ error: '无权限修改 Skill' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // 检查是否为内置 Skill
    const builtInSkills = getBuiltInSkills(user.tenantId);
    const isBuiltIn = builtInSkills.some(s => s.id === id);

    if (isBuiltIn) {
      // 内置 Skill：检查是否已有数据库记录用于覆盖配置
      const existing = await db.query.skills.findFirst({
        where: and(eq(skills.id, id), eq(skills.tenantId, user.tenantId)),
      });

      const builtInSkill = builtInSkills.find(s => s.id === id)!;

      if (existing) {
        // 更新现有覆盖记录
        const updated = await db.update(skills)
          .set({
            isActive: body.isActive !== undefined ? body.isActive : existing.isActive,
            config: body.config !== undefined ? body.config : existing.config,
            updatedAt: new Date(),
          })
          .where(and(eq(skills.id, id), eq(skills.tenantId, user.tenantId)))
          .returning();

        return NextResponse.json({
          success: true,
          data: { ...updated[0], source: 'builtin' },
        });
      } else {
        // 创建覆盖记录
        const newRecord = await db.insert(skills).values({
          id: builtInSkill.id,
          tenantId: user.tenantId,
          name: builtInSkill.name,
          description: builtInSkill.description,
          category: builtInSkill.category,
          version: builtInSkill.version,
          triggers: builtInSkill.triggers as any,
          executor: builtInSkill.executor as any,
          permissions: builtInSkill.permissions as any,
          isActive: body.isActive !== undefined ? body.isActive : builtInSkill.isActive,
          isBuiltIn: true,
          config: body.config || builtInSkill.config || null,
        }).returning();

        return NextResponse.json({
          success: true,
          data: { ...newRecord[0], source: 'builtin' },
        });
      }
    }

    // 自定义 Skill 更新
    const existing = await db.query.skills.findFirst({
      where: and(eq(skills.id, id), eq(skills.tenantId, user.tenantId)),
    });

    if (!existing) {
      return NextResponse.json({ error: 'Skill 不存在' }, { status: 404 });
    }

    // 构建更新字段
    const updateData: Record<string, any> = { updatedAt: new Date() };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.icon !== undefined) updateData.icon = body.icon;
    if (body.version !== undefined) updateData.version = body.version;
    if (body.triggers !== undefined) updateData.triggers = body.triggers;
    if (body.executor !== undefined) updateData.executor = body.executor;
    if (body.inputSchema !== undefined) updateData.inputSchema = body.inputSchema;
    if (body.outputSchema !== undefined) updateData.outputSchema = body.outputSchema;
    if (body.permissions !== undefined) updateData.permissions = body.permissions;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.config !== undefined) updateData.config = body.config;
    if (body.configSchema !== undefined) updateData.configSchema = body.configSchema;

    const updated = await db.update(skills)
      .set(updateData)
      .where(and(eq(skills.id, id), eq(skills.tenantId, user.tenantId)))
      .returning();

    return NextResponse.json({
      success: true,
      data: { ...updated[0], source: 'custom' },
    });
  } catch (error) {
    console.error('Update skill error:', error);
    return NextResponse.json({ error: '更新 Skill 失败' }, { status: 500 });
  }
}

/**
 * DELETE /api/skills/[id]
 * 删除自定义 Skill（内置 Skill 不可删除）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    if (!ADMIN_ROLES.includes(user.role as any)) {
      return NextResponse.json({ error: '无权限删除 Skill' }, { status: 403 });
    }

    const { id } = await params;

    // 检查是否为内置 Skill
    const builtInSkills = getBuiltInSkills(user.tenantId);
    const isBuiltIn = builtInSkills.some(s => s.id === id);

    if (isBuiltIn) {
      return NextResponse.json({ error: '内置 Skill 不可删除，只能停用' }, { status: 400 });
    }

    // 检查 Skill 是否存在
    const existing = await db.query.skills.findFirst({
      where: and(eq(skills.id, id), eq(skills.tenantId, user.tenantId)),
    });

    if (!existing) {
      return NextResponse.json({ error: 'Skill 不存在' }, { status: 404 });
    }

    // 删除
    await db.delete(skills)
      .where(and(eq(skills.id, id), eq(skills.tenantId, user.tenantId)));

    return NextResponse.json({
      success: true,
      message: 'Skill 已删除',
    });
  } catch (error) {
    console.error('Delete skill error:', error);
    return NextResponse.json({ error: '删除 Skill 失败' }, { status: 500 });
  }
}
