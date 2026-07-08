process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://cloudkitchen:cloudkitchen@localhost:5435/cloudkitchen';
process.env.JWT_COMPANY_ACCESS_SECRET =
  process.env.JWT_COMPANY_ACCESS_SECRET ?? 'test_company_access_secret_32chars';
process.env.JWT_COMPANY_REFRESH_SECRET =
  process.env.JWT_COMPANY_REFRESH_SECRET ?? 'test_company_refresh_secret_32chars';
process.env.JWT_DASHBOARD_ACCESS_SECRET =
  process.env.JWT_DASHBOARD_ACCESS_SECRET ?? 'test_dashboard_access_secret_32chars';
process.env.JWT_DASHBOARD_REFRESH_SECRET =
  process.env.JWT_DASHBOARD_REFRESH_SECRET ?? 'test_dashboard_refresh_secret_32chars';
process.env.OTP_PEPPER = process.env.OTP_PEPPER ?? 'test_otp_pepper_32_characters_xx';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS ?? 'http://localhost:3000';
process.env.REDIS_ENABLED = 'false';
process.env.LOG_LEVEL = 'error';
