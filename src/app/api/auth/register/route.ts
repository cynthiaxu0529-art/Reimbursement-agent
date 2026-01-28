import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { users, tenants, departments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// 解析邀请 token
function parseInviteToken(token: string): { email: string; tenantId: string; roles: string[]; department: string; departmentId?: string; setAsDeptManager?: boolean } | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const data = JSON.parse(decoded);
    if (data.tenantId && data.email) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name, companyName, inviteToken } = body;

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

    // 处理邀请 token
    let tenantId: string | null = null;
    type UserRole = 'employee' | 'manager' | 'finance' | 'admin' | 'super_admin';
    let userRole: UserRole = 'employee';
    let departmentName: string | null = null;
    let departmentId: string | null = null;
    let setAsDeptManager = false;

    // 映射邀请角色到数据库角色
    const roleMapping: Record<string, UserRole> = {
      employee: 'employee',
      approver: 'manager',  // 审批人 -> manager
      manager: 'manager',
      finance: 'finance',
      admin: 'admin',
      super_admin: 'super_admin',
    };

    if (inviteToken) {
      // 通过邀请链接注册
      const inviteData = parseInviteToken(inviteToken);
      if (inviteData) {
        // 验证邮箱匹配
        if (inviteData.email.toLowerCase() !== email.toLowerCase()) {
          return NextResponse.json(
            { error: '邮箱与邀请不匹配' },
            { status: 400 }
          );
        }
        tenantId = inviteData.tenantId;
        // 使用邀请中的角色（取第一个作为主要角色），并映射到数据库角色
        const inviteRole = inviteData.roles?.[0] || 'employee';
        userRole = roleMapping[inviteRole] || 'employee';
        // 提取部门信息
        departmentName = inviteData.department || null;
        setAsDeptManager = inviteData.setAsDeptManager || false;
        // 验证 departmentId 是否存在
        if (inviteData.departmentId) {
          const dept = await db.query.departments.findFirst({
            where: and(
              eq(departments.id, inviteData.departmentId),
              eq(departments.tenantId, inviteData.tenantId)
            ),
          });
          if (dept) {
            departmentId = dept.id;
            departmentName = dept.name; // 使用数据库中的实际名称
          }
        }
      }
    } else if (companyName) {
      // 创建新公司
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
      userRole = 'admin' as UserRole; // 创建公司的用户默认为管理员
    }

    // 创建用户
    const [user] = await db
      .insert(users)
      .values({
        email,
        name,
        passwordHash,
        tenantId,
        role: userRole,
        department: departmentName,
        departmentId,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
      });

    // 如果需要设为部门负责人，更新部门的 managerId
    if (setAsDeptManager && departmentId && user.id) {
      try {
        await db
          .update(departments)
          .set({ managerId: user.id, updatedAt: new Date() })
          .where(eq(departments.id, departmentId));
      } catch (e) {
        console.error('Failed to set department manager:', e);
      }
    }

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
