/**
 * Skill 管理 CRUD API
 * 提供 Skill 的列表查询和创建功能
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, skills } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { getBuiltInSkills } from '@/lib/skills/skill-manager';
import { ADMIN_ROLES } from '@/lib/auth/roles';

/**
 * GET /api/skills
 * 获取所有 Skill 列表（内置 + 自定义）
 *
 * Query params:
 * - type: 'all' | 'builtin' | 'custom' (默认 'all')
 * - category: 过滤类别
 * - active: 'true' | 'false' 过滤启用状态
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';
    const category = searchParams.get('category');
    const activeFilter = searchParams.get('active');

    // 获取内置 Skills
    let builtInSkills = getBuiltInSkills(user.tenantId).map(skill => ({
      ...skill,
      source: 'builtin' as const,
      createdAt: skill.createdAt.toISOString(),
      updatedAt: skill.updatedAt.toISOString(),
    }));

    // 获取数据库中的自定义 Skills
    let customSkills: any[] = [];
    if (type !== 'builtin') {
      const dbSkills = await db.query.skills.findMany({
        where: eq(skills.tenantId, user.tenantId),
      });

      customSkills = dbSkills.map(skill => ({
        id: skill.id,
        tenantId: skill.tenantId,
        name: skill.name,
        description: skill.description,
        category: skill.category,
        icon: skill.icon,
        version: skill.version,
        author: skill.author,
        triggers: skill.triggers,
        executor: skill.executor,
        inputSchema: skill.inputSchema,
        outputSchema: skill.outputSchema,
        permissions: skill.permissions,
        isActive: skill.isActive,
        isBuiltIn: skill.isBuiltIn,
        config: skill.config,
        configSchema: skill.configSchema,
        stats: skill.stats,
        source: 'custom' as const,
        createdAt: skill.createdAt.toISOString(),
        updatedAt: skill.updatedAt.toISOString(),
      }));
    }

    // 合并列表
    let allSkills: any[] = [];
    if (type === 'builtin') {
      allSkills = builtInSkills;
    } else if (type === 'custom') {
      allSkills = customSkills;
    } else {
      allSkills = [...builtInSkills, ...customSkills];
    }

    // 按类别过滤
    if (category) {
      allSkills = allSkills.filter(s => s.category === category);
    }

    // 按启用状态过滤
    if (activeFilter !== null && activeFilter !== undefined) {
      const isActive = activeFilter === 'true';
      allSkills = allSkills.filter(s => s.isActive === isActive);
    }

    return NextResponse.json({
      success: true,
      data: {
        skills: allSkills,
        summary: {
          total: allSkills.length,
          builtIn: builtInSkills.length,
          custom: customSkills.length,
          active: allSkills.filter(s => s.isActive).length,
        },
      },
    });
  } catch (error) {
    console.error('Get skills error:', error);
    return NextResponse.json({ error: '获取 Skill 列表失败' }, { status: 500 });
  }
}

/**
 * POST /api/skills
 * 创建新的自定义 Skill
 *
 * Body:
 * - name: string (必填)
 * - description: string
 * - category: string (必填)
 * - triggers: array
 * - executor: object (必填)
 * - inputSchema: object
 * - outputSchema: object
 * - permissions: array
 * - config: object
 * - configSchema: object
 */
export async function POST(request: NextRequest) {
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

    // 检查权限：仅 admin 和 super_admin 可创建
    if (!ADMIN_ROLES.includes(user.role as any)) {
      return NextResponse.json({ error: '无权限创建 Skill' }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      description,
      category,
      icon,
      version,
      triggers,
      executor,
      inputSchema,
      outputSchema,
      permissions,
      config,
      configSchema,
    } = body;

    // 验证必填字段
    if (!name) {
      return NextResponse.json({ error: 'Skill 名称不能为空' }, { status: 400 });
    }
    if (!category) {
      return NextResponse.json({ error: 'Skill 类别不能为空' }, { status: 400 });
    }
    if (!executor || !executor.type) {
      return NextResponse.json({ error: '执行器配置不能为空' }, { status: 400 });
    }

    // 验证执行器类型
    const validTypes = ['javascript', 'webhook', 'ai_prompt', 'mcp'];
    if (!validTypes.includes(executor.type)) {
      return NextResponse.json({ error: `不支持的执行器类型: ${executor.type}` }, { status: 400 });
    }

    const newSkill = await db.insert(skills).values({
      id: uuid(),
      tenantId: user.tenantId,
      name,
      description: description || '',
      category,
      icon: icon || null,
      version: version || '1.0.0',
      author: user.name || user.email,
      triggers: triggers || [],
      executor,
      inputSchema: inputSchema || null,
      outputSchema: outputSchema || null,
      permissions: permissions || [],
      isActive: true,
      isBuiltIn: false,
      config: config || null,
      configSchema: configSchema || null,
      stats: {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
      },
    }).returning();

    return NextResponse.json({
      success: true,
      data: newSkill[0],
    });
  } catch (error) {
    console.error('Create skill error:', error);
    return NextResponse.json({ error: '创建 Skill 失败' }, { status: 500 });
  }
}
