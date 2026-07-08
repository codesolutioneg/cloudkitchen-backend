import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prisma } from '../../prisma/client';
import { config } from '../../config';
import { BadRequestError, NotFoundError } from '../../core/errors/AppError';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function uploadsOrigin(): string {
  const candidates = [
    process.env.PUBLIC_API_URL,
    process.env.API_PUBLIC_URL,
    process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).find((s) => s.includes('api.')),
  ].filter(Boolean) as string[];

  for (const raw of candidates) {
    const origin = raw.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
    if (origin && !/localhost|127\.0\.0\.1/i.test(origin)) {
      return origin;
    }
  }

  // Production default for this deployment
  if (config.NODE_ENV === 'production') {
    return 'https://api.cloud-kitchen.code-solution.org';
  }

  return `http://localhost:${config.PORT}`;
}

/** Force absolute public URL for any stored upload path. */
export function toPublicUploadUrl(url: string): string {
  if (/^https?:\/\//i.test(url) && !/localhost|127\.0\.0\.1/i.test(url)) {
    return url;
  }
  const origin = uploadsOrigin();
  if (url.startsWith('/uploads/')) return `${origin}${url}`;
  return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, origin);
}

async function saveProductImageFile(productId: string, file: Express.Multer.File): Promise<string> {
  if (!IMAGE_MIMES.has(file.mimetype)) {
    throw new BadRequestError(`Unsupported image type: ${file.mimetype}`);
  }
  const ext = EXT_BY_MIME[file.mimetype] ?? 'jpg';
  const dir = path.resolve(config.UPLOAD_PATH, 'products', productId);
  await fs.mkdir(dir, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}.${ext}`;
  await fs.writeFile(path.join(dir, fileName), file.buffer);
  return toPublicUploadUrl(`/uploads/products/${productId}/${fileName}`);
}

export async function uploadProductImage(productId: string, file: Express.Multer.File) {
  const product = await prisma.product.findFirst({ where: { id: productId, is_deleted: false } });
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const imageUrl = toPublicUploadUrl(await saveProductImageFile(productId, file));

  await prisma.$transaction(async (tx) => {
    await tx.productMedia.updateMany({
      where: { product_id: productId, is_primary: true },
      data: { is_primary: false },
    });
    await tx.productMedia.create({
      data: {
        product_id: productId,
        media_type: 'image',
        url: imageUrl,
        sort_order: 0,
        is_primary: true,
      },
    });
    await tx.product.update({
      where: { id: productId },
      data: { image_url: imageUrl },
    });
  });

  return { productId, imageUrl };
}

export async function setProductImageUrl(productId: string, imageUrl: string | null) {
  const product = await prisma.product.findFirst({ where: { id: productId, is_deleted: false } });
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  if (!imageUrl) {
    await prisma.$transaction(async (tx) => {
      await tx.productMedia.deleteMany({ where: { product_id: productId, is_primary: true } });
      await tx.product.update({ where: { id: productId }, data: { image_url: null } });
    });
    return { productId, imageUrl: null };
  }

  await prisma.$transaction(async (tx) => {
    await tx.productMedia.updateMany({
      where: { product_id: productId, is_primary: true },
      data: { is_primary: false },
    });
    await tx.productMedia.create({
      data: {
        product_id: productId,
        media_type: 'image',
        url: imageUrl,
        sort_order: 0,
        is_primary: true,
      },
    });
    await tx.product.update({ where: { id: productId }, data: { image_url: imageUrl } });
  });

  return { productId, imageUrl };
}

export async function listProductMedia(productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, is_deleted: false } });
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const media = await prisma.productMedia.findMany({
    where: { product_id: productId },
    orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }],
  });

  return media.map((m) => ({
    id: m.id,
    productId: m.product_id,
    mediaType: m.media_type,
    url: toPublicUploadUrl(m.url),
    sortOrder: m.sort_order,
    isPrimary: m.is_primary,
  }));
}

export async function deleteProductMedia(productId: string, mediaId: string) {
  const media = await prisma.productMedia.findFirst({
    where: { id: mediaId, product_id: productId },
  });
  if (!media) {
    throw new NotFoundError('Media not found');
  }

  await prisma.productMedia.delete({ where: { id: mediaId } });

  if (media.is_primary) {
    const next = await prisma.productMedia.findFirst({
      where: { product_id: productId },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    if (next) {
      await prisma.$transaction([
        prisma.productMedia.update({ where: { id: next.id }, data: { is_primary: true } }),
        prisma.product.update({ where: { id: productId }, data: { image_url: next.url } }),
      ]);
    } else {
      await prisma.product.update({ where: { id: productId }, data: { image_url: null } });
    }
  }
}
