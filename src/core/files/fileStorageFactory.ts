import { config } from '../../config';
import type { IFileStorageProvider } from './IFileStorageProvider';
import { LocalFileStorageProvider } from './LocalFileStorageProvider';

let provider: IFileStorageProvider | undefined;

export function getFileStorageProvider(): IFileStorageProvider {
  if (!provider) {
    switch (config.FILE_STORAGE_PROVIDER) {
      case 'local':
        provider = new LocalFileStorageProvider();
        break;
      case 's3':
      case 'azure_blob':
        throw new Error(`FILE_STORAGE_PROVIDER=${config.FILE_STORAGE_PROVIDER} is not implemented yet`);
      default:
        provider = new LocalFileStorageProvider();
    }
  }
  return provider;
}
