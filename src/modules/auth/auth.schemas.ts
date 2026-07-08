import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const companyLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const companyOtpSendSchema = z.object({
  email: z.string().email(),
  purpose: z.enum(['login', 'registration', 'password_reset']).default('login'),
});

export const companyOtpVerifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  purpose: z.enum(['login', 'registration', 'password_reset']).default('login'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const dashboardLoginSchema = companyLoginSchema;
export const dashboardOtpSendSchema = z.object({ email: z.string().email() });
export const dashboardOtpVerifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

export const dashboardMeSchema = z
  .object({
    id: z.string().uuid(),
    fullName: z.string(),
    email: z.string().email(),
    status: z.string(),
    department: z.string().nullable(),
    mfaEnabled: z.boolean(),
    roles: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
    companyScope: z.object({ scopeType: z.string() }),
  })
  .openapi('DashboardMeResponse');

export const companyProfileSchema = z
  .object({
    company: z.object({
      id: z.string().uuid(),
      legalName: z.string(),
      tradeName: z.string().nullable(),
      primaryEmail: z.string().email(),
      primaryPhone: z.string(),
      countryCode: z.string(),
      city: z.string().nullable(),
      status: z.string(),
      approvalStatus: z.string(),
    }),
    user: z.object({
      id: z.string().uuid(),
      fullName: z.string(),
      email: z.string().email(),
      isPrimaryContact: z.boolean(),
      status: z.string(),
    }),
  })
  .openapi('CompanyProfileResponse');

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/company/login',
  tags: ['Company Auth'],
  summary: 'Company user password login',
  request: { body: { content: { 'application/json': { schema: companyLoginSchema } } } },
  responses: {
    200: {
      description: 'Token pair',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(tokenPairSchema) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/company/otp/send',
  tags: ['Company Auth'],
  summary: 'Send OTP to company user',
  request: { body: { content: { 'application/json': { schema: companyOtpSendSchema } } } },
  responses: { 204: { description: 'OTP sent' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/company/otp/verify',
  tags: ['Company Auth'],
  summary: 'Verify company OTP and receive tokens',
  request: { body: { content: { 'application/json': { schema: companyOtpVerifySchema } } } },
  responses: {
    200: {
      description: 'Token pair',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(tokenPairSchema) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/company/refresh',
  tags: ['Company Auth'],
  summary: 'Rotate company refresh token',
  request: { body: { content: { 'application/json': { schema: refreshTokenSchema } } } },
  responses: {
    200: {
      description: 'New token pair',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(tokenPairSchema) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/company/logout',
  tags: ['Company Auth'],
  summary: 'Revoke company refresh token',
  security: [{ companyBearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: refreshTokenSchema } } } },
  responses: { 204: { description: 'Logged out' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/company/profile',
  tags: ['Company Profile'],
  summary: 'Get authenticated company user profile',
  security: [{ companyBearerAuth: [] }],
  responses: {
    200: {
      description: 'Profile',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(companyProfileSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/dashboard/login',
  tags: ['Dashboard Auth'],
  summary: 'Dashboard user password login',
  request: { body: { content: { 'application/json': { schema: dashboardLoginSchema } } } },
  responses: {
    200: {
      description: 'Token pair',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(tokenPairSchema) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/dashboard/otp/send',
  tags: ['Dashboard Auth'],
  summary: 'Send OTP to dashboard user',
  request: { body: { content: { 'application/json': { schema: dashboardOtpSendSchema } } } },
  responses: { 204: { description: 'OTP sent' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/dashboard/otp/verify',
  tags: ['Dashboard Auth'],
  summary: 'Verify dashboard OTP',
  request: { body: { content: { 'application/json': { schema: dashboardOtpVerifySchema } } } },
  responses: {
    200: {
      description: 'Token pair',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(tokenPairSchema) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/dashboard/refresh',
  tags: ['Dashboard Auth'],
  summary: 'Rotate dashboard refresh token',
  request: { body: { content: { 'application/json': { schema: refreshTokenSchema } } } },
  responses: {
    200: {
      description: 'New token pair',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(tokenPairSchema) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/dashboard/logout',
  tags: ['Dashboard Auth'],
  summary: 'Revoke dashboard refresh token',
  security: [{ dashboardBearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: refreshTokenSchema } } } },
  responses: { 204: { description: 'Logged out' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/dashboard/me',
  tags: ['Dashboard Auth'],
  summary: 'Current dashboard user',
  security: [{ dashboardBearerAuth: [] }],
  responses: {
    200: {
      description: 'Me',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(dashboardMeSchema) } },
    },
  },
});
