import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-change-in-production';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'wbstudio2025';

export interface AuthToken {
  authenticated: boolean;
  iat: number;
  exp: number;
}

export function validatePassword(password: string): boolean {
  return password === AUTH_PASSWORD;
}

export function generateAuthToken(): string {
  const payload: Omit<AuthToken, 'iat' | 'exp'> = {
    authenticated: true,
  };
  
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '7d',
  });
}

export function verifyAuthToken(token: string): AuthToken | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthToken;
    return decoded;
  } catch {
    return null;
  }
}

export function isProductionEnvironment(): boolean {
  const isVercel = !!process.env.VERCEL;
  const isProduction = process.env.NODE_ENV === 'production';
  const isVercelUrl = process.env.VERCEL_URL !== undefined;
  
  console.log('🔍 Auth Debug - VERCEL:', process.env.VERCEL, 'NODE_ENV:', process.env.NODE_ENV, 'VERCEL_URL:', !!process.env.VERCEL_URL);
  
  // Use any of these indicators that we're on Vercel/production
  return isVercel || (isProduction && isVercelUrl);
}

export function shouldRequireAuth(): boolean {
  const shouldAuth = isProductionEnvironment();
  console.log('🔍 Auth Debug - shouldRequireAuth:', shouldAuth);
  return shouldAuth;
}

export function isPublicRoute(pathname: string): boolean {
  // Allow public access to preview routes
  return pathname.startsWith('/preview');
}