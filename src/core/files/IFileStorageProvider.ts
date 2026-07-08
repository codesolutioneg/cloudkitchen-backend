export interface FileUploadMeta {
  fileName: string;
  mimeType: string;
}

export interface FileUploadResult {
  storageKey: string;
  url?: string;
}

export interface IFileStorageProvider {
  upload(buffer: Buffer, meta: FileUploadMeta): Promise<FileUploadResult>;
  getAbsolutePath(storageKey: string): string;
  delete(storageKey: string): Promise<void>;
}
