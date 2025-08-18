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
  return process.env.NEXT_PUBLIC_ENABLE_AUTH === 'true';
}

export function shouldRequireAuth(): boolean {
  return isProductionEnvironment();
}

export function isPublicRoute(pathname: string): boolean {
  // Allow public access to preview routes
  return pathname.startsWith('/preview');
}