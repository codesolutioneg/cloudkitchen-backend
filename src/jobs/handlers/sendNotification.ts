import { prisma } from '../../prisma/client';
import { logger } from '../../core/utils/logger';
import { sendEmail } from '../../core/notifications/emailSender';
import { sendPushToUser } from '../../core/notifications/pushSender';
import { markInAppDelivered } from '../../core/notifications/inAppNotifier';

export async function handleSendNotification(payload: { notificationId: string }): Promise<void> {
  const notification = await prisma.notification.findUnique({
    where: { id: payload.notificationId },
  });

  if (!notification) {
    logger.warn({ notificationId: payload.notificationId }, 'Notification not found for send job');
    return;
  }

  if (notification.status === 'sent' || notification.status === 'delivered' || notification.status === 'read') {
    return;
  }

  try {
    switch (notification.channel) {
      case 'email': {
        const recipientEmail = await resolveRecipientEmail(
          notification.recipient_type,
          notification.recipient_id,
        );
        if (!recipientEmail) {
          throw new Error('Recipient email not found');
        }
        await sendEmail({
          to: recipientEmail,
          subject: notification.subject ?? undefined,
          body: notification.body,
        });
        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: 'sent', sent_at: new Date() },
        });
        break;
      }

      case 'push': {
        if (!notification.recipient_type || !notification.recipient_id) {
          throw new Error('Push requires recipient_type and recipient_id');
        }
        const result = await sendPushToUser(
          notification.recipient_type as 'company_user' | 'dashboard_user',
          notification.recipient_id,
          {
            title: notification.subject ?? undefined,
            body: notification.body,
          },
        );
        await prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: result.sent > 0 ? 'sent' : 'failed',
            sent_at: new Date(),
          },
        });
        break;
      }

      case 'in_app': {
        await markInAppDelivered(notification.id);
        break;
      }

      default:
        logger.info({ channel: notification.channel }, 'Unsupported notification channel — marking sent');
        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: 'sent', sent_at: new Date() },
        });
    }
  } catch (err) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: 'failed' },
    });
    throw err;
  }
}

async function resolveRecipientEmail(
  recipientType: string | null,
  recipientId: string | null,
): Promise<string | null> {
  if (!recipientType || !recipientId) {
    return null;
  }
  if (recipientType === 'company_user') {
    const user = await prisma.companyUser.findUnique({ where: { id: recipientId } });
    return user?.email ?? null;
  }
  if (recipientType === 'dashboard_user') {
    const user = await prisma.dashboardUser.findUnique({ where: { id: recipientId } });
    return user?.email ?? null;
  }
  return null;
}
