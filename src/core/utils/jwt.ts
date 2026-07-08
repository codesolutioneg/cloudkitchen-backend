import jwt, { type SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { config } from '../../config';

export type JwtAudience = 'company' | 'dashboard';

export interface CompanyAccessPayload {
  sub: string;
  aud: 'company';
  companyId: string;
  type: 'access';
}

export interface DashboardAccessPayload {
  sub: string;
  aud: 'dashboard';
  type: 'access';
  roles: string[];
}

export interface RefreshPayload {
  sub: string;
  aud: JwtAudience;
  type: 'refresh';
}

function accessSecret(aud: JwtAudience): string {
  return aud === 'company'
    ? config.JWT_COMPANY_ACCESS_SECRET
    : config.JWT_DASHBOARD_ACCESS_SECRET;
}

function refreshSecret(aud: JwtAudience): string {
  return aud === 'company'
    ? config.JWT_COMPANY_REFRESH_SECRET
    : config.JWT_DASHBOARD_REFRESH_SECRET;
}

export function signCompanyAccess(payload: Omit<CompanyAccessPayload, 'aud' | 'type'>): string {
  const options: SignOptions = { expiresIn: config.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign({ ...payload, aud: 'company', type: 'access' }, accessSecret('company'), options);
}

export function signDashboardAccess(
  payload: Omit<DashboardAccessPayload, 'aud' | 'type'>,
): string {
  const options: SignOptions = { expiresIn: config.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign(
    { ...payload, aud: 'dashboard', type: 'access' },
    accessSecret('dashboard'),
    options,
  );
}

export function signRefreshToken(sub: string, aud: JwtAudience): string {
  const options: SignOptions = { expiresIn: config.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign({ sub, aud, type: 'refresh', jti: randomUUID() }, refreshSecret(aud), options);
}

export function verifyCompanyAccess(token: string): CompanyAccessPayload {
  const payload = jwt.verify(token, accessSecret('company')) as CompanyAccessPayload;
  if (payload.aud !== 'company' || payload.type !== 'access') {
    throw new Error('Invalid company access token');
  }
  return payload;
}

export function verifyDashboardAccess(token: string): DashboardAccessPayload {
  const payload = jwt.verify(token, accessSecret('dashboard')) as DashboardAccessPayload;
  if (payload.aud !== 'dashboard' || payload.type !== 'access') {
    throw new Error('Invalid dashboard access token');
  }
  return payload;
}

export function verifyRefreshToken(token: string, aud: JwtAudience): RefreshPayload {
  const payload = jwt.verify(token, refreshSecret(aud)) as RefreshPayload;
  if (payload.aud !== aud || payload.type !== 'refresh') {
    throw new Error('Invalid refresh token');
  }
  return payload;
}

export function extractBearerToken(authorization?: string): string | undefined {
  if (!authorization?.startsWith('Bearer ')) {
    return undefined;
  }
  return authorization.slice(7).trim() || undefined;
}
