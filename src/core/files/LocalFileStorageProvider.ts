import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { config } from '../../config';
import type { FileUploadMeta, FileUploadResult, IFileStorageProvider } from './IFileStorageProvider';

export class LocalFileStorageProvider implements IFileStorageProvider {
  private readonly basePath: string;

  constructor(basePath = config.UPLOAD_PATH) {
    this.basePath = path.resolve(basePath);
  }

  async upload(buffer: Buffer, meta: FileUploadMeta): Promise<FileUploadResult> {
    const ext = path.extname(meta.fileName) || '';
    const storageKey = `${randomUUID()}${ext}`;
    const absolutePath = this.getAbsolutePath(storageKey);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);

    return {
      storageKey,
      url: `/uploads/${storageKey}`,
    };
  }

  getAbsolutePath(storageKey: string): string {
    const normalized = path.normalize(storageKey).replace(/^(\.\.[/\\])+/, '');
    return path.join(this.basePath, normalized);
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await fs.unlink(this.getAbsolutePath(storageKey));
    } catch {
      // File may already be gone — idempotent delete.
    }
  }
}
