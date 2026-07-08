import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { ForbiddenError, NotFoundError } from '../core/errors/AppError';

export interface ResolvedConfig {
  key: string;
  value: Prisma.JsonValue;
  source: 'company' | 'global';
  version?: number;
}

export const configResolver = {
  /**
   * Resolution contract (§18): company override wins when active; else global default.
   * Throws if neither exists — never silently hardcode a default.
   */
  async resolve(companyId: string, settingKey: string): Promise<ResolvedConfig> {
    const companyConfig = await prisma.companyConfiguration.findFirst({
      where: {
        company_id: companyId,
        config_key: settingKey,
        is_active: true,
      },
      orderBy: { config_version: 'desc' },
    });

    if (companyConfig) {
      return {
        key: settingKey,
        value: companyConfig.config_value,
        source: 'company',
        version: companyConfig.config_version,
      };
    }

    const globalSetting = await prisma.globalSetting.findUnique({
      where: { setting_key: settingKey },
    });

    if (globalSetting) {
      return {
        key: settingKey,
        value: globalSetting.setting_value,
        source: 'global',
      };
    }

    throw new NotFoundError(`Configuration key '${settingKey}' not found`);
  },

  async resolveMany(
    companyId: string,
    keys: string[],
  ): Promise<Record<string, ResolvedConfig>> {
    const result: Record<string, ResolvedConfig> = {};
    for (const key of keys) {
      result[key] = await this.resolve(companyId, key);
    }
    return result;
  },

  async assertOverridable(settingKey: string): Promise<void> {
    const globalSetting = await prisma.globalSetting.findUnique({
      where: { setting_key: settingKey },
    });
    if (globalSetting && !globalSetting.is_overridable) {
      throw new ForbiddenError(
        `Setting '${settingKey}' is not overridable at company level`,
      );
    }
  },
};
