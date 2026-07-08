import { prisma } from '../prisma/client';
import { config } from '../config';
import { enqueueJob } from '../jobs/jobQueue';

export interface QueueNotificationInput {
  templateCode: string;
  channels?: string[];
  recipientType: 'company_user' | 'dashboard_user';
  recipientId: string;
  recipientCompanyId?: string;
  languageCode?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  variables?: Record<string, string>;
}

function renderTemplate(template: string, variables: Record<string, string> = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? '');
}

async function resolveLanguageCode(preferred?: string): Promise<string> {
  if (preferred) {
    const lang = await prisma.language.findFirst({
      where: { code: preferred, is_active: true },
    });
    if (lang) {
      return lang.code;
    }
  }
  const defaultLang = await prisma.language.findFirst({ where: { is_default: true } });
  return defaultLang?.code ?? config.BUSINESS_DEFAULT_LANGUAGE;
}

export const notificationEngine = {
  async queueNotification(input: QueueNotificationInput): Promise<string[]> {
    const languageCode = await resolveLanguageCode(input.languageCode);
    const templates = await prisma.notificationTemplate.findMany({
      where: {
        code: input.templateCode,
        language_code: languageCode,
        ...(input.channels?.length ? { channel: { in: input.channels } } : {}),
      },
    });

    if (templates.length === 0) {
      const fallbackLang = await prisma.language.findFirst({ where: { is_default: true } });
      if (fallbackLang && fallbackLang.code !== languageCode) {
        const fallbackTemplates = await prisma.notificationTemplate.findMany({
          where: {
            code: input.templateCode,
            language_code: fallbackLang.code,
            ...(input.channels?.length ? { channel: { in: input.channels } } : {}),
          },
        });
        templates.push(...fallbackTemplates);
      }
    }

    const notificationIds: string[] = [];
    const vars = input.variables ?? {};

    for (const template of templates) {
      const subject = template.subject_template
        ? renderTemplate(template.subject_template, vars)
        : null;
      const body = renderTemplate(template.body_template, vars);

      const notification = await prisma.notification.create({
        data: {
          template_id: template.id,
          channel: template.channel,
          recipient_type: input.recipientType,
          recipient_id: input.recipientId,
          recipient_company_id: input.recipientCompanyId ?? null,
          subject,
          body,
          status: 'queued',
          related_entity_type: input.relatedEntityType ?? null,
          related_entity_id: input.relatedEntityId ?? null,
        },
      });

      notificationIds.push(notification.id);

      await enqueueJob({
        jobType: 'send_notification',
        payload: { notificationId: notification.id },
        queueName: 'notifications',
      });
    }

    return notificationIds;
  },
};
