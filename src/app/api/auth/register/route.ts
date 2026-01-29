import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { users, tenants, departments, invitations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  verifyInviteToken,
  hashToken,
  isInvitationExpired,
  parseLegacyToken,
  detectTokenVersion,
} from '@/lib/invite';
import { getHighestRole, INVITE_ROLE_MAPPING, type Role } from '@/lib/auth';

export const dynamic = 'force-dynamic';

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
    let userRole: Role = 'employee';
    let departmentName: string | null = null;
    let departmentId: string | null = null;
    let setAsDeptManager = false;
    let invitationRecord: typeof invitations.$inferSelect | null = null;

    if (inviteToken) {
      // 检测token版本
      const tokenVersion = detectTokenVersion(inviteToken);

      if (tokenVersion === 'new') {
        // ===== 新版安全Token处理 =====
        const tokenData = verifyInviteToken(inviteToken);
        if (!tokenData) {
          return NextResponse.json(
            { error: '邀请链接无效或已被篡改' },
            { status: 400 }
          );
        }

        // 验证邮箱匹配
        if (tokenData.email.toLowerCase() !== email.toLowerCase()) {
          return NextResponse.json(
            { error: '邮箱与邀请不匹配' },
            { status: 400 }
          );
        }

        // 通过token哈希查找邀请记录
        const tokenHashValue = hashToken(inviteToken);
        const foundInvitation = await db.query.invitations.findFirst({
          where: and(
            eq(invitations.id, tokenData.invitationId),
            eq(invitations.tokenHash, tokenHashValue)
          ),
        });
        invitationRecord = foundInvitation || null;

        if (!invitationRecord) {
          return NextResponse.json(
            { error: '邀请记录不存在' },
            { status: 400 }
          );
        }

        // 验证邀请状态
        if (invitationRecord.status !== 'pending') {
          const statusMessages: Record<string, string> = {
            accepted: '该邀请已被使用',
            expired: '该邀请已过期',
            revoked: '该邀请已被撤销',
          };
          return NextResponse.json(
            { error: statusMessages[invitationRecord.status] || '邀请无效' },
            { status: 400 }
          );
        }

        // 验证过期时间
        if (isInvitationExpired(invitationRecord.expiresAt)) {
          // 更新状态为过期
          await db.update(invitations)
            .set({ status: 'expired', updatedAt: new Date() })
            .where(eq(invitations.id, invitationRecord.id));

          return NextResponse.json(
            { error: '邀请已过期，请联系管理员重新发送' },
            { status: 400 }
          );
        }

        // 从数据库记录获取邀请信息（而非token，更安全）
        tenantId = invitationRecord.tenantId;
        const inviteRoles = (invitationRecord.roles as string[]) || ['employee'];
        const mappedRoles = inviteRoles.map(r => INVITE_ROLE_MAPPING[r] || 'employee') as Role[];
        userRole = getHighestRole(mappedRoles);
        setAsDeptManager = invitationRecord.setAsDeptManager || false;

        // 验证并设置部门信息
        if (invitationRecord.departmentId) {
          const dept = await db.query.departments.findFirst({
            where: and(
              eq(departments.id, invitationRecord.departmentId),
              eq(departments.tenantId, invitationRecord.tenantId)
            ),
          });
          if (dept) {
            departmentId = dept.id;
            departmentName = dept.name;
          }
        }

      } else if (tokenVersion === 'legacy') {
        // ===== 旧版Token兼容处理（过渡期） =====
        console.warn(`Legacy invite token used for ${email}, consider migrating to new token format`);

        const legacyData = parseLegacyToken(inviteToken);
        if (!legacyData) {
          return NextResponse.json(
            { error: '邀请链接无效' },
            { status: 400 }
          );
        }

        // 验证邮箱匹配
        if (legacyData.email.toLowerCase() !== email.toLowerCase()) {
          return NextResponse.json(
            { error: '邮箱与邀请不匹配' },
            { status: 400 }
          );
        }

        tenantId = legacyData.tenantId;
        const inviteRoles = legacyData.roles || ['employee'];
        const mappedRoles = inviteRoles.map(r => INVITE_ROLE_MAPPING[r] || 'employee') as Role[];
        userRole = getHighestRole(mappedRoles);
        setAsDeptManager = legacyData.setAsDeptManager || false;

        // 验证并设置部门信息
        if (legacyData.departmentId) {
          const dept = await db.query.departments.findFirst({
            where: and(
              eq(departments.id, legacyData.departmentId),
              eq(departments.tenantId, legacyData.tenantId)
            ),
          });
          if (dept) {
            departmentId = dept.id;
            departmentName = dept.name;
          }
        }

      } else {
        return NextResponse.json(
          { error: '邀请链接无效' },
          { status: 400 }
        );
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
      userRole = 'admin' as Role; // 创建公司的用户默认为管理员
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

    // 标记邀请为已接受（仅新版token）
    if (invitationRecord) {
      try {
        await db.update(invitations)
          .set({
            status: 'accepted',
            acceptedAt: new Date(),
            acceptedByUserId: user.id,
            updatedAt: new Date(),
          })
          .where(eq(invitations.id, invitationRecord.id));
      } catch (e) {
        console.error('Failed to mark invitation as accepted:', e);
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
