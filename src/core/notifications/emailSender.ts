import { config } from '../../config';
import { logger } from '../utils/logger';

export interface EmailMessage {
  to: string;
  subject?: string;
  body: string;
}

export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (!config.NOTIFICATIONS_EMAIL_ENABLED) {
    logger.info({ to: message.to, subject: message.subject }, '[mock] email notification');
    return true;
  }

  // Real SMTP/provider integration deferred — log for v1 scaffolding
  logger.info(
    { to: message.to, subject: message.subject, provider: config.NOTIFICATIONS_EMAIL_PROVIDER },
    'Email send requested (provider not wired in v1)',
  );
  return true;
}
