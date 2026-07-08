import { prisma } from '../../prisma/client';
import { config } from '../../config';
import { logger } from '../utils/logger';
import { getFirebaseApp } from './firebaseApp';

export interface PushMessage {
  title?: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPushToUser(
  ownerType: 'company_user' | 'dashboard_user',
  ownerId: string,
  message: PushMessage,
): Promise<{ sent: number; failed: number }> {
  const tokens = await prisma.deviceToken.findMany({
    where: { owner_type: ownerType, owner_id: ownerId, is_active: true },
  });

  if (tokens.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const device of tokens) {
    const ok = await sendPushToToken(device.token, message);
    if (ok) {
      sent++;
      await prisma.deviceToken.update({
        where: { id: device.id },
        data: { last_used_at: new Date() },
      });
    } else {
      failed++;
    }
  }

  return { sent, failed };
}

export async function sendPushToToken(token: string, message: PushMessage): Promise<boolean> {
  if (
    process.env.VITEST === 'true' ||
    config.NODE_ENV === 'test' ||
    !config.NOTIFICATIONS_PUSH_ENABLED
  ) {
    logger.info({ token: token.slice(0, 8), message }, '[mock] push notification');
    return true;
  }

  const app = getFirebaseApp();
  if (!app) {
    logger.warn({ message }, 'Push disabled — skipping FCM send');
    return false;
  }

  try {
    await app.messaging().send({
      token,
      notification: {
        title: message.title,
        body: message.body,
      },
      data: message.data,
    });
    return true;
  } catch (err) {
    logger.error({ err, token: token.slice(0, 8) }, 'FCM send failed');
    return false;
  }
}
