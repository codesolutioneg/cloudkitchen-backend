import { prisma } from '../prisma/client';

let defaultLanguageCache: string | null = null;

async function getDefaultLanguageCode(): Promise<string> {
  if (defaultLanguageCache) {
    return defaultLanguageCache;
  }
  const lang = await prisma.language.findFirst({ where: { is_default: true } });
  defaultLanguageCache = lang?.code ?? 'en';
  return defaultLanguageCache;
}

export async function resolveTranslation(
  entityType: string,
  entityId: string,
  fieldName: string,
  languageCode: string,
): Promise<string | null> {
  const direct = await lookupTranslation(entityType, entityId, fieldName, languageCode);
  if (direct !== null) {
    return direct;
  }

  const defaultCode = await getDefaultLanguageCode();
  if (languageCode !== defaultCode) {
    return lookupTranslation(entityType, entityId, fieldName, defaultCode);
  }

  return null;
}

async function lookupTranslation(
  entityType: string,
  entityId: string,
  fieldName: string,
  languageCode: string,
): Promise<string | null> {
  if (entityType === 'product') {
    const row = await prisma.productTranslation.findUnique({
      where: { product_id_language_code: { product_id: entityId, language_code: languageCode } },
    });
    if (!row) {
      return null;
    }
    if (fieldName === 'name') {
      return row.name;
    }
    if (fieldName === 'description') {
      return row.description;
    }
    return null;
  }

  const row = await prisma.translation.findUnique({
    where: {
      entity_type_entity_id_field_name_language_code: {
        entity_type: entityType,
        entity_id: entityId,
        field_name: fieldName,
        language_code: languageCode,
      },
    },
  });
  return row?.translated_value ?? null;
}

export async function listTranslations(query: {
  entityType?: string;
  entityId?: string;
  languageCode?: string;
}) {
  const items: Array<{
    id: string;
    entityType: string;
    entityId: string;
    fieldName: string;
    languageCode: string;
    translatedValue: string;
  }> = [];

  if (query.entityType === 'product' || !query.entityType) {
    const productWhere = {
      ...(query.entityId ? { product_id: query.entityId } : {}),
      ...(query.languageCode ? { language_code: query.languageCode } : {}),
    };
    const productRows = await prisma.productTranslation.findMany({ where: productWhere });
    for (const row of productRows) {
      items.push({
        id: row.id,
        entityType: 'product',
        entityId: row.product_id,
        fieldName: 'name',
        languageCode: row.language_code,
        translatedValue: row.name,
      });
      if (row.description) {
        items.push({
          id: `${row.id}-desc`,
          entityType: 'product',
          entityId: row.product_id,
          fieldName: 'description',
          languageCode: row.language_code,
          translatedValue: row.description,
        });
      }
    }
  }

  if (query.entityType !== 'product') {
    const where = {
      ...(query.entityType ? { entity_type: query.entityType } : {}),
      ...(query.entityId ? { entity_id: query.entityId } : {}),
      ...(query.languageCode ? { language_code: query.languageCode } : {}),
    };
    const rows = await prisma.translation.findMany({ where, orderBy: { field_name: 'asc' } });
    for (const row of rows) {
      items.push({
        id: row.id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        fieldName: row.field_name,
        languageCode: row.language_code,
        translatedValue: row.translated_value,
      });
    }
  }

  return items;
}
