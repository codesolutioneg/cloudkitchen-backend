import { createHash, randomInt } from 'crypto';
import { config } from '../../config';

const OTP_LENGTH = 6;
const OTP_EXPIRES_MINUTES = 10;

export function generateOtpCode(): string {
  if (config.NODE_ENV === 'test') {
    return '123456';
  }
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

export function hashOtp(code: string): string {
  return createHash('sha256').update(`${code}${config.OTP_PEPPER}`).digest('hex');
}

export function verifyOtpHash(code: string, storedHash: string): boolean {
  return hashOtp(code) === storedHash;
}

export function otpExpiresAt(): Date {
  return new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);
}
