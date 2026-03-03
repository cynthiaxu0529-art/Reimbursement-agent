import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware: 保护 dashboard 路由，未认证用户重定向到登录页
 *
 * 通过检查 NextAuth v5 session cookie 判断是否已认证。
 * 真正的认证验证在 API 路由层完成（auth()），前端通过 401 检测做二次跳转。
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 只保护 dashboard 路由
  if (pathname.startsWith('/dashboard')) {
    // NextAuth v5 cookie: authjs.session-token (HTTP) 或 __Secure-authjs.session-token (HTTPS)
    const hasSession = request.cookies.has('authjs.session-token') ||
                       request.cookies.has('__Secure-authjs.session-token');

    if (!hasSession) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
