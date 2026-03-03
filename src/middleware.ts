import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware: 保护 dashboard 路由，未认证用户重定向到登录页
 *
 * 通过检查 NextAuth v5 session cookie 判断是否已认证。
 * 真正的认证验证在 API 路由层完成（auth()），这里仅做路由保护。
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // NextAuth v5 cookie: authjs.session-token (HTTP) 或 __Secure-authjs.session-token (HTTPS)
  const hasSession = request.cookies.has('authjs.session-token') ||
                     request.cookies.has('__Secure-authjs.session-token');

  // 已认证用户访问登录/注册页 → 重定向到 dashboard
  if ((pathname === '/login' || pathname === '/register') && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // dashboard 路由需要认证
  if (pathname.startsWith('/dashboard') && !hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/register'],
};
