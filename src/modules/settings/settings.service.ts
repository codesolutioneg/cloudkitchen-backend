import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { ForbiddenError, NotFoundError } from '../../core/errors/AppError';
import { getRequestActor } from '../../core/middleware/requestContext';
import { configResolver } from '../../engines/configResolver';

function getCompanyActorOrThrow() {
  const actor = getRequestActor();
  if (actor?.type !== 'company_user' || !actor.companyId) {
    throw new ForbiddenError('Company authentication required');
  }
  return { ...actor, companyId: actor.companyId };
}

function getDashboardActorOrThrow() {
  const actor = getRequestActor();
  if (actor?.type !== 'dashboard_user') {
    throw new ForbiddenError('Dashboard authentication required');
  }
  return actor;
}

function serializeGlobalSetting(row: {
  setting_key: string;
  setting_value: Prisma.JsonValue;
  is_overridable: boolean;
  description: string | null;
}) {
  return {
    key: row.setting_key,
    value: row.setting_value,
    isOverridable: row.is_overridable,
    description: row.description,
  };
}

async function appendCompanyConfigHistory(
  companyId: string,
  configKey: string,
  configValue: Prisma.InputJsonValue,
  configVersion: number,
) {
  const actor = getRequestActor();
  await prisma.companyConfigurationHistory.create({
    data: {
      company_id: companyId,
      config_key: configKey,
      config_value: configValue,
      config_version: configVersion,
      changed_by_type: actor?.type ?? null,
      changed_by_id: actor?.id ?? null,
    },
  });
}

async function appendGlobalSettingHistory(
  settingKey: string,
  settingValue: Prisma.InputJsonValue,
  changedBy: string | null,
) {
  await prisma.globalSettingHistory.create({
    data: {
      setting_key: settingKey,
      setting_value: settingValue,
      changed_by: changedBy,
    },
  });
}

// ── Company settings ──────────────────────────────────────────────────────────

export async function getCompanySettings() {
  const actor = getCompanyActorOrThrow();
  const rows = await prisma.companyConfiguration.findMany({
    where: { company_id: actor.companyId, is_active: true },
    orderBy: { config_key: 'asc' },
  });

  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    settings[row.config_key] = row.config_value;
  }

  return { companyId: actor.companyId, settings };
}

export async function putCompanySettings(settings: Record<string, unknown>) {
  const actor = getCompanyActorOrThrow();

  for (const [key, value] of Object.entries(settings)) {
    await configResolver.assertOverridable(key);

    const existing = await prisma.companyConfiguration.findFirst({
      where: { company_id: actor.companyId, config_key: key },
    });

    if (existing) {
      const updated = await prisma.companyConfiguration.update({
        where: { id: existing.id },
        data: {
          config_value: value as Prisma.InputJsonValue,
          config_version: { increment: 1 },
          is_active: true,
        },
      });
      await appendCompanyConfigHistory(
        actor.companyId,
        key,
        value as Prisma.InputJsonValue,
        updated.config_version,
      );
    } else {
      const created = await prisma.companyConfiguration.create({
        data: {
          company_id: actor.companyId,
          config_key: key,
          config_value: value as Prisma.InputJsonValue,
          config_version: 1,
        },
      });
      await appendCompanyConfigHistory(
        actor.companyId,
        key,
        value as Prisma.InputJsonValue,
        created.config_version,
      );
    }
  }

  return getCompanySettings();
}

// ── Dashboard global settings ─────────────────────────────────────────────────

export async function getGlobalSettings() {
  const rows = await prisma.globalSetting.findMany({ orderBy: { setting_key: 'asc' } });
  return {
    settings: Object.fromEntries(
      rows.map((r) => [r.setting_key, serializeGlobalSetting(r)]),
    ),
  };
}

export async function putGlobalSettings(settings: Record<string, unknown>) {
  const actor = getDashboardActorOrThrow();

  for (const [key, value] of Object.entries(settings)) {
    const existing = await prisma.globalSetting.findUnique({
      where: { setting_key: key },
    });

    if (existing) {
      await prisma.globalSetting.update({
        where: { setting_key: key },
        data: {
          setting_value: value as Prisma.InputJsonValue,
          updated_by: actor.id,
        },
      });
    } else {
      await prisma.globalSetting.create({
        data: {
          setting_key: key,
          setting_value: value as Prisma.InputJsonValue,
          updated_by: actor.id,
        },
      });
    }

    await appendGlobalSettingHistory(key, value as Prisma.InputJsonValue, actor.id);
  }

  return getGlobalSettings();
}

// ── Dashboard company settings override ───────────────────────────────────────

export async function getCompanySettingsForDashboard(companyId: string) {
  const company = await prisma.company.findFirst({ where: { id: companyId } });
  if (!company) {
    throw new NotFoundError('Company not found');
  }

  const rows = await prisma.companyConfiguration.findMany({
    where: { company_id: companyId, is_active: true },
    orderBy: { config_key: 'asc' },
  });

  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    settings[row.config_key] = row.config_value;
  }

  return { companyId, settings };
}

export async function putCompanySettingsForDashboard(
  companyId: string,
  settings: Record<string, unknown>,
) {
  getDashboardActorOrThrow();

  const company = await prisma.company.findFirst({ where: { id: companyId } });
  if (!company) {
    throw new NotFoundError('Company not found');
  }

  for (const [key, value] of Object.entries(settings)) {
    await configResolver.assertOverridable(key);

    const existing = await prisma.companyConfiguration.findFirst({
      where: { company_id: companyId, config_key: key },
    });

    if (existing) {
      const updated = await prisma.companyConfiguration.update({
        where: { id: existing.id },
        data: {
          config_value: value as Prisma.InputJsonValue,
          config_version: { increment: 1 },
          is_active: true,
        },
      });
      await appendCompanyConfigHistory(
        companyId,
        key,
        value as Prisma.InputJsonValue,
        updated.config_version,
      );
    } else {
      const created = await prisma.companyConfiguration.create({
        data: {
          company_id: companyId,
          config_key: key,
          config_value: value as Prisma.InputJsonValue,
          config_version: 1,
        },
      });
      await appendCompanyConfigHistory(
        companyId,
        key,
        value as Prisma.InputJsonValue,
        created.config_version,
      );
    }
  }

  return getCompanySettingsForDashboard(companyId);
}
