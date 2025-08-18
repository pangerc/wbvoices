import { NextRequest, NextResponse } from 'next/server';
import { shouldRequireAuth, isPublicRoute, verifyAuthToken } from './lib/auth';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth requirements if not in production (Vercel)
  if (!shouldRequireAuth()) {
    return NextResponse.next();
  }

  // Allow public routes (preview pages)
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Allow auth API routes to function
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // Check for auth token
  const token = request.cookies.get('auth-token')?.value;

  if (!token || !verifyAuthToken(token)) {
    // Redirect to login by returning a response that will show the login form
    const response = NextResponse.next();
    response.headers.set('x-require-auth', 'true');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};