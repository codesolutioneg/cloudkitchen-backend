import { prisma } from '../../prisma/client';

export interface InAppNotificationInput {
  templateId?: string;
  recipientType: 'company_user' | 'dashboard_user';
  recipientId: string;
  recipientCompanyId?: string;
  subject?: string;
  body: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export async function writeInAppNotification(input: InAppNotificationInput): Promise<string> {
  const row = await prisma.notification.create({
    data: {
      template_id: input.templateId ?? null,
      channel: 'in_app',
      recipient_type: input.recipientType,
      recipient_id: input.recipientId,
      recipient_company_id: input.recipientCompanyId ?? null,
      subject: input.subject ?? null,
      body: input.body,
      status: 'delivered',
      sent_at: new Date(),
      related_entity_type: input.relatedEntityType ?? null,
      related_entity_id: input.relatedEntityId ?? null,
    },
  });
  return row.id;
}

export async function markInAppDelivered(notificationId: string): Promise<void> {
  await prisma.notification.update({
    where: { id: notificationId },
    data: { status: 'delivered', sent_at: new Date() },
  });
}
