import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { ForbiddenError, NotFoundError, ConflictError } from '../../core/errors/AppError';
import { isPrismaUniqueViolation } from '../../core/utils/prismaErrors';

function serializeNotification(row: {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  read_at: Date | null;
  created_at: Date;
}) {
  return {
    id: row.id,
    channel: row.channel,
    subject: row.subject,
    body: row.body,
    status: row.status,
    readAt: row.read_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

function serializeDeviceToken(row: {
  id: string;
  platform: string;
  token: string;
  is_active: boolean;
}) {
  return {
    id: row.id,
    platform: row.platform,
    token: row.token,
    isActive: row.is_active,
  };
}

function serializeTemplate(row: {
  id: string;
  code: string;
  channel: string;
  subject_template: string | null;
  body_template: string;
  language_code: string;
}) {
  return {
    id: row.id,
    code: row.code,
    channel: row.channel,
    subjectTemplate: row.subject_template,
    bodyTemplate: row.body_template,
    languageCode: row.language_code,
  };
}

export async function listNotificationsForUser(
  actorId: string,
  companyId: string,
  query: { page?: number; pageSize?: number; status?: string },
) {
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 20, 100);
  const skip = (page - 1) * pageSize;

  const where: Prisma.NotificationWhereInput = {
    OR: [
      { recipient_type: 'company_user', recipient_id: actorId },
      { recipient_company_id: companyId },
    ],
    ...(query.status ? { status: query.status } : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.notification.count({ where }),
  ]);

  return {
    items: items.map(serializeNotification),
    pagination: { page, pageSize, totalItems },
  };
}

export async function markNotificationRead(
  notificationId: string,
  actorId: string,
  companyId: string,
) {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification) {
    throw new NotFoundError('Notification not found');
  }

  const isOwner =
    (notification.recipient_type === 'company_user' && notification.recipient_id === actorId) ||
    notification.recipient_company_id === companyId;

  if (!isOwner) {
    throw new ForbiddenError('Not allowed to read this notification');
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { status: 'read', read_at: new Date() },
  });

  return serializeNotification(updated);
}

export async function registerDeviceToken(
  ownerId: string,
  input: { platform: string; token: string },
) {
  const existing = await prisma.deviceToken.findFirst({
    where: { owner_type: 'company_user', owner_id: ownerId, token: input.token },
  });

  if (existing) {
    const updated = await prisma.deviceToken.update({
      where: { id: existing.id },
      data: { is_active: true, platform: input.platform, last_used_at: new Date() },
    });
    return serializeDeviceToken(updated);
  }

  const row = await prisma.deviceToken.create({
    data: {
      owner_type: 'company_user',
      owner_id: ownerId,
      platform: input.platform,
      token: input.token,
    },
  });
  return serializeDeviceToken(row);
}

export async function deleteDeviceToken(deviceTokenId: string, ownerId: string) {
  const token = await prisma.deviceToken.findUnique({ where: { id: deviceTokenId } });
  if (!token) {
    throw new NotFoundError('Device token not found');
  }
  if (token.owner_type !== 'company_user' || token.owner_id !== ownerId) {
    throw new ForbiddenError('Not allowed to delete this device token');
  }

  await prisma.deviceToken.update({
    where: { id: deviceTokenId },
    data: { is_active: false },
  });
}

export async function listNotificationTemplates() {
  const rows = await prisma.notificationTemplate.findMany({
    orderBy: [{ code: 'asc' }, { channel: 'asc' }, { language_code: 'asc' }],
  });
  return rows.map(serializeTemplate);
}

export async function createNotificationTemplate(input: {
  code: string;
  channel: string;
  subjectTemplate?: string;
  bodyTemplate: string;
  languageCode: string;
}) {
  try {
    const row = await prisma.notificationTemplate.create({
      data: {
        code: input.code,
        channel: input.channel,
        subject_template: input.subjectTemplate ?? null,
        body_template: input.bodyTemplate,
        language_code: input.languageCode,
      },
    });
    return serializeTemplate(row);
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ConflictError('Template with this code/channel/language already exists');
    }
    throw err;
  }
}

export async function updateNotificationTemplate(
  templateId: string,
  input: { subjectTemplate?: string | null; bodyTemplate?: string },
) {
  const existing = await prisma.notificationTemplate.findUnique({ where: { id: templateId } });
  if (!existing) {
    throw new NotFoundError('Notification template not found');
  }

  const row = await prisma.notificationTemplate.update({
    where: { id: templateId },
    data: {
      ...(input.subjectTemplate !== undefined ? { subject_template: input.subjectTemplate } : {}),
      ...(input.bodyTemplate !== undefined ? { body_template: input.bodyTemplate } : {}),
    },
  });
  return serializeTemplate(row);
}
