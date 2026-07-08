import bcrypt from 'bcryptjs';
import { prisma } from '../../prisma/client';
import { config } from '../../config';
import { sha256 } from '../../core/utils/hash';
import {
  generateOtpCode,
  hashOtp,
  otpExpiresAt,
  verifyOtpHash,
} from '../../core/utils/otp';
import {
  signCompanyAccess,
  signDashboardAccess,
  signRefreshToken,
  verifyRefreshToken,
} from '../../core/utils/jwt';
import {
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
} from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';

const MAX_OTP_ATTEMPTS = 5;

function refreshExpiresAt(): Date {
  const raw = config.JWT_REFRESH_EXPIRES_IN;
  const match = /^(\d+)([dhms])$/.exec(raw);
  if (!match) {
    return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  }
  const amount = Number(match[1]);
  const unit = match[2] ?? 'd';
  const multipliers: Record<string, number> = {
    d: 86_400_000,
    h: 3_600_000,
    m: 60_000,
    s: 1_000,
  };
  return new Date(Date.now() + amount * (multipliers[unit] ?? 86_400_000));
}

async function issueCompanyTokens(companyUserId: string, companyId: string) {
  const accessToken = signCompanyAccess({ sub: companyUserId, companyId });
  const refreshToken = signRefreshToken(companyUserId, 'company');
  const tokenHash = sha256(refreshToken);

  await prisma.companyUserRefreshToken.create({
    data: {
      company_user_id: companyUserId,
      token_hash: tokenHash,
      expires_at: refreshExpiresAt(),
    },
  });

  return { accessToken, refreshToken };
}

async function issueDashboardTokens(dashboardUserId: string, roleCodes: string[]) {
  const accessToken = signDashboardAccess({ sub: dashboardUserId, roles: roleCodes });
  const refreshToken = signRefreshToken(dashboardUserId, 'dashboard');
  const tokenHash = sha256(refreshToken);

  await prisma.dashboardUserRefreshToken.create({
    data: {
      dashboard_user_id: dashboardUserId,
      token_hash: tokenHash,
      expires_at: refreshExpiresAt(),
    },
  });

  return { accessToken, refreshToken };
}

async function loadDashboardRoleCodes(dashboardUserId: string): Promise<string[]> {
  const rows = await prisma.dashboardUserRole.findMany({
    where: { dashboard_user_id: dashboardUserId },
    include: { role: { select: { name: true } } },
  });
  return rows.map((r) => r.role.name);
}

export async function companyLogin(
  email: string,
  password: string,
  meta: { ip?: string; userAgent?: string },
) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await prisma.companyUser.findFirst({
    where: { email: normalizedEmail, is_deleted: false },
  });

  if (!user) {
    await prisma.companyUserLoginHistory.create({
      data: {
        attempted_email: normalizedEmail,
        success: false,
        failure_reason: 'user_not_found',
        ip_address: meta.ip,
        user_agent: meta.userAgent,
      },
    });
    throw new UnauthorizedError('Invalid credentials', ErrorCodes.INVALID_CREDENTIALS);
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await prisma.companyUserLoginHistory.create({
      data: {
        company_user_id: user.id,
        attempted_email: normalizedEmail,
        success: false,
        failure_reason: 'invalid_password',
        ip_address: meta.ip,
        user_agent: meta.userAgent,
      },
    });
    throw new UnauthorizedError('Invalid credentials', ErrorCodes.INVALID_CREDENTIALS);
  }

  if (user.status === 'locked' || user.status === 'inactive') {
    throw new ForbiddenError('Account is not active', ErrorCodes.ACCOUNT_INACTIVE);
  }

  if (user.status === 'invited') {
    await prisma.companyUser.update({
      where: { id: user.id },
      data: { status: 'active' },
    });
  }

  await prisma.companyUser.update({
    where: { id: user.id },
    data: { last_login_at: new Date() },
  });

  await prisma.companyUserLoginHistory.create({
    data: {
      company_user_id: user.id,
      attempted_email: normalizedEmail,
      success: true,
      ip_address: meta.ip,
      user_agent: meta.userAgent,
    },
  });

  return issueCompanyTokens(user.id, user.company_id);
}

export async function companySendOtp(
  email: string,
  purpose: 'login' | 'registration' | 'password_reset',
) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await prisma.companyUser.findFirst({
    where: { email: normalizedEmail, is_deleted: false },
  });

  if (purpose === 'login' && !user) {
    throw new NotFoundUserForOtp();
  }

  const code = generateOtpCode();
  await prisma.companyUserOtpCode.create({
    data: {
      company_user_id: user?.id ?? null,
      destination: normalizedEmail,
      purpose,
      code_hash: hashOtp(code),
      expires_at: otpExpiresAt(),
    },
  });

  if (config.NODE_ENV !== 'production') {
    console.info(`[mock-otp] company ${purpose} for ${normalizedEmail}: ${code}`);
  }
}

class NotFoundUserForOtp extends UnauthorizedError {
  constructor() {
    super('Invalid credentials', ErrorCodes.INVALID_CREDENTIALS);
  }
}

export async function companyVerifyOtp(
  email: string,
  code: string,
  purpose: 'login' | 'registration' | 'password_reset',
  meta: { ip?: string; userAgent?: string },
) {
  const normalizedEmail = email.toLowerCase().trim();
  const otp = await prisma.companyUserOtpCode.findFirst({
    where: {
      destination: normalizedEmail,
      purpose,
      consumed_at: null,
      expires_at: { gt: new Date() },
    },
    orderBy: { expires_at: 'desc' },
  });

  if (!otp) {
    throw new BadRequestError('OTP expired or not found', ErrorCodes.OTP_EXPIRED);
  }

  if (otp.attempt_count >= MAX_OTP_ATTEMPTS) {
    throw new BadRequestError('Too many OTP attempts', ErrorCodes.OTP_MAX_ATTEMPTS);
  }

  if (!verifyOtpHash(code, otp.code_hash)) {
    await prisma.companyUserOtpCode.update({
      where: { id: otp.id },
      data: { attempt_count: { increment: 1 } },
    });
    throw new BadRequestError('Invalid OTP', ErrorCodes.OTP_INVALID);
  }

  await prisma.companyUserOtpCode.update({
    where: { id: otp.id },
    data: { consumed_at: new Date() },
  });

  const user = await prisma.companyUser.findFirst({
    where: { email: normalizedEmail, is_deleted: false },
  });

  if (!user) {
    throw new UnauthorizedError('User not found', ErrorCodes.INVALID_CREDENTIALS);
  }

  await prisma.companyUserLoginHistory.create({
    data: {
      company_user_id: user.id,
      attempted_email: normalizedEmail,
      success: true,
      ip_address: meta.ip,
      user_agent: meta.userAgent,
    },
  });

  return issueCompanyTokens(user.id, user.company_id);
}

export async function companyRefresh(rawToken: string) {
  const payload = verifyRefreshToken(rawToken, 'company');
  const tokenHash = sha256(rawToken);

  const stored = await prisma.companyUserRefreshToken.findFirst({
    where: {
      token_hash: tokenHash,
      company_user_id: payload.sub,
      revoked_at: null,
      expires_at: { gt: new Date() },
    },
  });

  if (!stored) {
    throw new UnauthorizedError('Invalid refresh token', ErrorCodes.TOKEN_INVALID);
  }

  const user = await prisma.companyUser.findUnique({ where: { id: payload.sub } });
  if (!user || user.is_deleted) {
    throw new UnauthorizedError('User not found', ErrorCodes.TOKEN_INVALID);
  }

  const newRefresh = signRefreshToken(user.id, 'company');
  const newHash = sha256(newRefresh);

  await prisma.$transaction(async (tx) => {
    const replacement = await tx.companyUserRefreshToken.create({
      data: {
        company_user_id: user.id,
        token_hash: newHash,
        expires_at: refreshExpiresAt(),
      },
    });

    await tx.companyUserRefreshToken.update({
      where: { id: stored.id },
      data: { revoked_at: new Date(), replaced_by_token_id: replacement.id },
    });
  });

  return {
    accessToken: signCompanyAccess({ sub: user.id, companyId: user.company_id }),
    refreshToken: newRefresh,
  };
}

export async function companyLogout(companyUserId: string, rawToken: string) {
  const tokenHash = sha256(rawToken);
  await prisma.companyUserRefreshToken.updateMany({
    where: { company_user_id: companyUserId, token_hash: tokenHash, revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

export async function dashboardLogin(
  email: string,
  password: string,
  meta: { ip?: string; userAgent?: string },
) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await prisma.dashboardUser.findFirst({
    where: { email: normalizedEmail, is_deleted: false },
  });

  if (!user) {
    await prisma.dashboardUserLoginHistory.create({
      data: {
        attempted_email: normalizedEmail,
        success: false,
        failure_reason: 'user_not_found',
        ip_address: meta.ip,
        user_agent: meta.userAgent,
      },
    });
    throw new UnauthorizedError('Invalid credentials', ErrorCodes.INVALID_CREDENTIALS);
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await prisma.dashboardUserLoginHistory.create({
      data: {
        dashboard_user_id: user.id,
        attempted_email: normalizedEmail,
        success: false,
        failure_reason: 'invalid_password',
        ip_address: meta.ip,
        user_agent: meta.userAgent,
      },
    });
    throw new UnauthorizedError('Invalid credentials', ErrorCodes.INVALID_CREDENTIALS);
  }

  if (user.status === 'locked' || user.status === 'inactive') {
    throw new ForbiddenError('Account is not active', ErrorCodes.ACCOUNT_INACTIVE);
  }

  if (user.status === 'invited') {
    await prisma.dashboardUser.update({
      where: { id: user.id },
      data: { status: 'active' },
    });
  }

  await prisma.dashboardUser.update({
    where: { id: user.id },
    data: { last_login_at: new Date() },
  });

  await prisma.dashboardUserLoginHistory.create({
    data: {
      dashboard_user_id: user.id,
      attempted_email: normalizedEmail,
      success: true,
      ip_address: meta.ip,
      user_agent: meta.userAgent,
    },
  });

  const roles = await loadDashboardRoleCodes(user.id);
  return issueDashboardTokens(user.id, roles);
}

export async function dashboardSendOtp(email: string) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await prisma.dashboardUser.findFirst({
    where: { email: normalizedEmail, is_deleted: false },
  });
  if (!user) {
    throw new UnauthorizedError('Invalid credentials', ErrorCodes.INVALID_CREDENTIALS);
  }

  const code = generateOtpCode();
  await prisma.dashboardUserOtpCode.create({
    data: {
      dashboard_user_id: user.id,
      destination: normalizedEmail,
      purpose: 'login',
      code_hash: hashOtp(code),
      expires_at: otpExpiresAt(),
    },
  });

  if (config.NODE_ENV !== 'production') {
    console.info(`[mock-otp] dashboard login for ${normalizedEmail}: ${code}`);
  }
}

export async function dashboardVerifyOtp(
  email: string,
  code: string,
  _meta: { ip?: string; userAgent?: string },
) {
  const normalizedEmail = email.toLowerCase().trim();
  const otp = await prisma.dashboardUserOtpCode.findFirst({
    where: {
      destination: normalizedEmail,
      purpose: 'login',
      consumed_at: null,
      expires_at: { gt: new Date() },
    },
    orderBy: { expires_at: 'desc' },
  });

  if (!otp) {
    throw new BadRequestError('OTP expired or not found', ErrorCodes.OTP_EXPIRED);
  }

  if (otp.attempt_count >= MAX_OTP_ATTEMPTS) {
    throw new BadRequestError('Too many OTP attempts', ErrorCodes.OTP_MAX_ATTEMPTS);
  }

  if (!verifyOtpHash(code, otp.code_hash)) {
    await prisma.dashboardUserOtpCode.update({
      where: { id: otp.id },
      data: { attempt_count: { increment: 1 } },
    });
    throw new BadRequestError('Invalid OTP', ErrorCodes.OTP_INVALID);
  }

  await prisma.dashboardUserOtpCode.update({
    where: { id: otp.id },
    data: { consumed_at: new Date() },
  });

  const user = await prisma.dashboardUser.findFirst({
    where: { email: normalizedEmail, is_deleted: false },
  });
  if (!user) {
    throw new UnauthorizedError('User not found', ErrorCodes.INVALID_CREDENTIALS);
  }

  const roles = await loadDashboardRoleCodes(user.id);
  return issueDashboardTokens(user.id, roles);
}

export async function dashboardRefresh(rawToken: string) {
  const payload = verifyRefreshToken(rawToken, 'dashboard');
  const tokenHash = sha256(rawToken);

  const stored = await prisma.dashboardUserRefreshToken.findFirst({
    where: {
      token_hash: tokenHash,
      dashboard_user_id: payload.sub,
      revoked_at: null,
      expires_at: { gt: new Date() },
    },
  });

  if (!stored) {
    throw new UnauthorizedError('Invalid refresh token', ErrorCodes.TOKEN_INVALID);
  }

  const user = await prisma.dashboardUser.findUnique({ where: { id: payload.sub } });
  if (!user || user.is_deleted) {
    throw new UnauthorizedError('User not found', ErrorCodes.TOKEN_INVALID);
  }

  const roles = await loadDashboardRoleCodes(user.id);
  const newRefresh = signRefreshToken(user.id, 'dashboard');
  const newHash = sha256(newRefresh);

  await prisma.$transaction(async (tx) => {
    const replacement = await tx.dashboardUserRefreshToken.create({
      data: {
        dashboard_user_id: user.id,
        token_hash: newHash,
        expires_at: refreshExpiresAt(),
      },
    });

    await tx.dashboardUserRefreshToken.update({
      where: { id: stored.id },
      data: { revoked_at: new Date(), replaced_by_token_id: replacement.id },
    });
  });

  return {
    accessToken: signDashboardAccess({ sub: user.id, roles }),
    refreshToken: newRefresh,
  };
}

export async function dashboardLogout(dashboardUserId: string, rawToken: string) {
  const tokenHash = sha256(rawToken);
  await prisma.dashboardUserRefreshToken.updateMany({
    where: { dashboard_user_id: dashboardUserId, token_hash: tokenHash, revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

export async function getDashboardMe(dashboardUserId: string) {
  const user = await prisma.dashboardUser.findFirst({
    where: { id: dashboardUserId, is_deleted: false },
    include: {
      roles: { include: { role: true } },
      company_scope: true,
    },
  });

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    status: user.status,
    department: user.department,
    mfaEnabled: user.mfa_enabled,
    roles: user.roles.map((r) => ({
      id: r.role_id,
      name: r.role.name,
    })),
    companyScope: user.company_scope
      ? { scopeType: user.company_scope.scope_type }
      : { scopeType: 'all' },
  };
}

export async function getCompanyProfile(companyUserId: string, companyId: string) {
  const user = await prisma.companyUser.findFirst({
    where: { id: companyUserId, company_id: companyId, is_deleted: false },
  });
  if (!user) {
    throw new ForbiddenError('Access denied');
  }

  const company = await prisma.company.findFirst({
    where: { id: companyId, is_deleted: false },
  });
  if (!company) {
    throw new ForbiddenError('Access denied');
  }

  return {
    company: {
      id: company.id,
      legalName: company.legal_name,
      tradeName: company.trade_name,
      primaryEmail: company.primary_email,
      primaryPhone: company.primary_phone,
      countryCode: company.country_code,
      city: company.city,
      status: company.status,
      approvalStatus: company.approval_status,
    },
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      isPrimaryContact: user.is_primary_contact,
      status: user.status,
    },
  };
}
