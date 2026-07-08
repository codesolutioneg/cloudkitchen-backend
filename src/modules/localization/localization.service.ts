import { prisma } from '../../prisma/client';
import { NotFoundError, ConflictError } from '../../core/errors/AppError';
import { isPrismaUniqueViolation } from '../../core/utils/prismaErrors';
import { listTranslations as resolveListTranslations } from '../../engines/localizationResolver';

function serializeLanguage(row: {
  code: string;
  name: string;
  native_name: string;
  is_rtl: boolean;
  is_active: boolean;
  is_default: boolean;
}) {
  return {
    code: row.code,
    name: row.name,
    nativeName: row.native_name,
    isRtl: row.is_rtl,
    isActive: row.is_active,
    isDefault: row.is_default,
  };
}

export async function listLanguages() {
  const rows = await prisma.language.findMany({ orderBy: { code: 'asc' } });
  return rows.map(serializeLanguage);
}

export async function listActiveLanguages() {
  const rows = await prisma.language.findMany({
    where: { is_active: true },
    orderBy: { code: 'asc' },
  });
  return rows.map(serializeLanguage);
}

export async function createLanguage(input: {
  code: string;
  name: string;
  nativeName: string;
  isRtl?: boolean;
  isActive?: boolean;
  isDefault?: boolean;
}) {
  if (input.isDefault) {
    await prisma.language.updateMany({ data: { is_default: false } });
  }

  try {
    const row = await prisma.language.create({
      data: {
        code: input.code,
        name: input.name,
        native_name: input.nativeName,
        is_rtl: input.isRtl ?? false,
        is_active: input.isActive ?? true,
        is_default: input.isDefault ?? false,
      },
    });
    return serializeLanguage(row);
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ConflictError('Language code already exists');
    }
    throw err;
  }
}

export async function updateLanguage(
  code: string,
  input: {
    name?: string;
    nativeName?: string;
    isRtl?: boolean;
    isActive?: boolean;
    isDefault?: boolean;
  },
) {
  const existing = await prisma.language.findUnique({ where: { code } });
  if (!existing) {
    throw new NotFoundError('Language not found');
  }

  if (input.isDefault) {
    await prisma.language.updateMany({
      where: { code: { not: code } },
      data: { is_default: false },
    });
  }

  const row = await prisma.language.update({
    where: { code },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.nativeName !== undefined ? { native_name: input.nativeName } : {}),
      ...(input.isRtl !== undefined ? { is_rtl: input.isRtl } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      ...(input.isDefault !== undefined ? { is_default: input.isDefault } : {}),
    },
  });
  return serializeLanguage(row);
}

export async function listTranslations(query: {
  entityType?: string;
  entityId?: string;
  languageCode?: string;
}) {
  return resolveListTranslations(query);
}

export async function upsertTranslations(
  items: Array<{
    entityType: string;
    entityId: string;
    fieldName: string;
    languageCode: string;
    translatedValue: string;
  }>,
) {
  const results = [];

  for (const item of items) {
    if (item.entityType === 'product') {
      const existing = await prisma.productTranslation.findUnique({
        where: {
          product_id_language_code: {
            product_id: item.entityId,
            language_code: item.languageCode,
          },
        },
      });

      const row = await prisma.productTranslation.upsert({
        where: {
          product_id_language_code: {
            product_id: item.entityId,
            language_code: item.languageCode,
          },
        },
        update: {
          ...(item.fieldName === 'name' ? { name: item.translatedValue } : {}),
          ...(item.fieldName === 'description' ? { description: item.translatedValue } : {}),
        },
        create: {
          product_id: item.entityId,
          language_code: item.languageCode,
          name: item.fieldName === 'name' ? item.translatedValue : (existing?.name ?? 'Untitled'),
          description:
            item.fieldName === 'description'
              ? item.translatedValue
              : (existing?.description ?? null),
        },
      });

      results.push({
        id: row.id,
        entityType: 'product',
        entityId: row.product_id,
        fieldName: item.fieldName,
        languageCode: row.language_code,
        translatedValue:
          item.fieldName === 'name' ? row.name : (row.description ?? item.translatedValue),
      });
      continue;
    }

    const row = await prisma.translation.upsert({
      where: {
        entity_type_entity_id_field_name_language_code: {
          entity_type: item.entityType,
          entity_id: item.entityId,
          field_name: item.fieldName,
          language_code: item.languageCode,
        },
      },
      update: { translated_value: item.translatedValue },
      create: {
        entity_type: item.entityType,
        entity_id: item.entityId,
        field_name: item.fieldName,
        language_code: item.languageCode,
        translated_value: item.translatedValue,
      },
    });

    results.push({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      fieldName: row.field_name,
      languageCode: row.language_code,
      translatedValue: row.translated_value,
    });
  }

  return results;
}
