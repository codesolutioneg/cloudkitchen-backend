import { createHash } from 'crypto';
import { fromBuffer } from 'file-type';
import { prisma } from '../../prisma/client';
import { getFileStorageProvider } from '../../core/files/fileStorageFactory';
import type { RequestActor } from '../../core/middleware/requestContext';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { config } from '../../config';
import { ALLOWED_MIMES } from '../../core/middleware/upload';

export interface UploadFileInput {
  buffer: Buffer;
  fileName: string;
  declaredMimeType: string;
  entityType: string;
  entityId: string;
  attachmentType: string;
  caption?: string;
}

export async function uploadFile(input: UploadFileInput, actor: RequestActor) {
  await assertEntityAccess(actor, input.entityType, input.entityId);

  const detected = await fromBuffer(input.buffer);
  const mimeType = detected?.mime ?? input.declaredMimeType;

  if (!ALLOWED_MIMES.has(mimeType)) {
    throw new BadRequestError('Unsupported file type', ErrorCodes.UNSUPPORTED_FILE_TYPE);
  }

  const storage = getFileStorageProvider();
  const uploaded = await storage.upload(input.buffer, {
    fileName: input.fileName,
    mimeType,
  });

  const checksum = createHash('sha256').update(input.buffer).digest('hex');

  const file = await prisma.file.create({
    data: {
      file_name: input.fileName,
      storage_key: uploaded.storageKey,
      storage_provider: config.FILE_STORAGE_PROVIDER,
      url: uploaded.url ?? null,
      mime_type: mimeType,
      size_bytes: BigInt(input.buffer.length),
      checksum,
      uploaded_by_type: actor.type,
      uploaded_by_id: actor.id,
      is_public: false,
      attachments: {
        create: {
          entity_type: input.entityType,
          entity_id: input.entityId,
          attachment_type: input.attachmentType,
          caption: input.caption ?? null,
          verification_status: 'pending',
        },
      },
    },
    include: { attachments: true },
  });

  return serializeFile(file);
}

export async function getFileById(fileId: string, actor: RequestActor) {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    include: { attachments: true },
  });

  if (!file) {
    throw new NotFoundError('File not found');
  }

  for (const attachment of file.attachments) {
    await assertEntityAccess(actor, attachment.entity_type, attachment.entity_id);
  }

  return {
    file: serializeFile(file),
    absolutePath: getFileStorageProvider().getAbsolutePath(file.storage_key),
  };
}

export async function deleteAttachment(attachmentId: string, actor: RequestActor) {
  const attachment = await prisma.fileAttachment.findUnique({
    where: { id: attachmentId },
    include: { file: true },
  });

  if (!attachment) {
    throw new NotFoundError('Attachment not found');
  }

  await assertEntityAccess(actor, attachment.entity_type, attachment.entity_id);

  await prisma.$transaction(async (tx) => {
    await tx.fileAttachment.delete({ where: { id: attachmentId } });

    const remaining = await tx.fileAttachment.count({ where: { file_id: attachment.file_id } });
    if (remaining === 0) {
      await getFileStorageProvider().delete(attachment.file.storage_key);
      await tx.file.delete({ where: { id: attachment.file_id } });
    }
  });
}

async function assertEntityAccess(
  actor: RequestActor,
  entityType: string,
  entityId: string,
): Promise<void> {
  if (actor.type === 'dashboard_user') {
    return;
  }

  if (actor.type === 'company_user') {
    if (entityType === 'company' && entityId === actor.companyId) {
      return;
    }

    if (entityType === 'company') {
      throw new ForbiddenError('Cannot access another company\'s files');
    }

    const company = await prisma.company.findFirst({
      where: { id: actor.companyId, is_deleted: false },
      select: { id: true },
    });

    if (!company) {
      throw new ForbiddenError('Company not found for caller');
    }

    return;
  }

  throw new ForbiddenError('Unsupported actor type');
}

function serializeFile(
  file: Awaited<ReturnType<typeof prisma.file.create>> & {
    attachments?: Array<{ id: string; entity_type: string; entity_id: string; attachment_type: string }>;
  },
) {
  return {
    id: file.id,
    fileName: file.file_name,
    mimeType: file.mime_type,
    sizeBytes: Number(file.size_bytes),
    url: file.url,
    storageProvider: file.storage_provider,
    uploadedByType: file.uploaded_by_type,
    uploadedById: file.uploaded_by_id,
    createdAt: file.created_at.toISOString(),
    attachments: (file.attachments ?? []).map((a) => ({
      id: a.id,
      entityType: a.entity_type,
      entityId: a.entity_id,
      attachmentType: a.attachment_type,
    })),
  };
}
