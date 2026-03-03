import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Middleware: 保护 dashboard 路由，未认证用户重定向到登录页
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 已认证用户访问登录/注册页 → 重定向到 dashboard
  if (pathname === '/login' || pathname === '/register') {
    const token = await getToken({ req: request, secret: process.env.AUTH_SECRET || 'development-secret-change-in-production' });
    if (token?.id) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  // dashboard 路由需要认证
  if (pathname.startsWith('/dashboard')) {
    const token = await getToken({ req: request, secret: process.env.AUTH_SECRET || 'development-secret-change-in-production' });
    if (!token?.id) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/register'],
};
