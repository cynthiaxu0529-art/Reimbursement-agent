import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { users, tenants } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name, companyName } = body;

    // 验证必填字段
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: '请填写所有必填字段' },
        { status: 400 }
      );
    }

    // 检查邮箱是否已存在
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      return NextResponse.json(
        { error: '该邮箱已被注册' },
        { status: 400 }
      );
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 12);

    // 创建租户（如果提供了公司名）
    let tenantId: string | null = null;
    if (companyName) {
      const slug = companyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const [tenant] = await db
        .insert(tenants)
        .values({
          name: companyName,
          slug: `${slug}-${Date.now()}`,
          plan: 'free',
        })
        .returning();

      tenantId = tenant.id;
    }

    // 创建用户
    const [user] = await db
      .insert(users)
      .values({
        email,
        name,
        passwordHash,
        tenantId,
        role: tenantId ? 'admin' : 'employee', // 创建公司的用户默认为管理员
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
      });

    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: '注册失败，请稍后重试' },
      { status: 500 }
    );
  }
}
