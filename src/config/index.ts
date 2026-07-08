import { z } from 'zod';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const boolStr = z
  .string()
  .transform((v) => v === 'true' || v === '1')
  .default('false');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),

  DATABASE_URL: z.string().min(1),

  JWT_COMPANY_ACCESS_SECRET: z.string().min(32),
  JWT_COMPANY_REFRESH_SECRET: z.string().min(32),
  JWT_DASHBOARD_ACCESS_SECRET: z.string().min(32),
  JWT_DASHBOARD_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('14d'),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:5173'),

  OTP_PROVIDER: z.enum(['mock', 'twilio']).default('mock'),
  OTP_PEPPER: z.string().min(32),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  FILE_STORAGE_PROVIDER: z.enum(['local', 's3', 'azure_blob']).default('local'),
  FILE_STORAGE_S3_BUCKET: z.string().optional(),
  FILE_STORAGE_S3_REGION: z.string().optional(),
  FILE_STORAGE_S3_ACCESS_KEY_ID: z.string().optional(),
  FILE_STORAGE_S3_SECRET_ACCESS_KEY: z.string().optional(),
  UPLOAD_PATH: z.string().default('./uploads'),

  REDIS_ENABLED: boolStr,
  REDIS_URL: z.string().default('redis://localhost:6379'),

  NOTIFICATIONS_EMAIL_ENABLED: boolStr,
  NOTIFICATIONS_EMAIL_PROVIDER: z.enum(['smtp', 'resend', 'sendgrid']).default('smtp'),
  NOTIFICATIONS_EMAIL_FROM: z.string().email().default('noreply@cloudkitchen.example'),
  NOTIFICATIONS_SMS_ENABLED: boolStr,
  NOTIFICATIONS_PUSH_ENABLED: boolStr,

  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  INTEGRATIONS_DEFAULT_EXTERNAL_SYSTEM: z.string().default('odoo'),

  BUSINESS_DEFAULT_CURRENCY: z.string().default('SAR'),
  BUSINESS_DEFAULT_TIMEZONE: z.string().default('Asia/Riyadh'),
  BUSINESS_DEFAULT_LANGUAGE: z.string().default('en'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
