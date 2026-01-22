/**
 * NextAuth.js 配置
 * 支持邮箱密码登录和 Google OAuth
 */

import NextAuth from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// 检查是否在构建时 - 检查多个条件
const isBuilding = process.env.NODE_ENV === 'production' &&
  typeof window === 'undefined' &&
  !process.env.VERCEL_ENV;

// 创建 NextAuth 配置
const authConfig = {
  // 只在有数据库连接时使用 adapter
  ...(process.env.POSTGRES_URL || process.env.DATABASE_URL
    ? { adapter: DrizzleAdapter(getDb()) }
    : {}),
  session: {
    strategy: 'jwt' as const,
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: process.env.AUTH_SECRET || 'development-secret-change-in-production',
  providers: [
    // Google OAuth - 仅在有配置时启用
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),

    // 邮箱密码登录
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        try {
          // 查找用户
          const db = getDb();
          const user = await db.query.users.findFirst({
            where: eq(users.email, email),
          });

          if (!user || !user.passwordHash) {
            return null;
          }

          // 验证密码
          const isValid = await bcrypt.compare(password, user.passwordHash);
          if (!isValid) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.avatar,
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: { token: any; user: any }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }: { session: any; token: any }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;

        try {
          // 获取用户详细信息
          const db = getDb();
          const dbUser = await db.query.users.findFirst({
            where: eq(users.id, token.id as string),
          });

          if (dbUser) {
            session.user.role = dbUser.role;
            session.user.tenantId = dbUser.tenantId ?? undefined;
          }
        } catch (error) {
          console.error('Session callback error:', error);
        }
      }
      return session;
    },
  },
  trustHost: true,
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);

// 扩展 Session 类型
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string;
      role?: string;
      tenantId?: string;
    };
  }
}
