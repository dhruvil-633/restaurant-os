export interface UploadInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  /** Logical grouping, e.g. `menu-items`, `employees`, `invoices`. */
  folder: string;
}

export interface StoredFile {
  /** Absolute URL for cloud providers; a `/uploads/...` path for local disk. */
  url: string;
  /** Provider-specific handle used to delete the object later. */
  storageKey: string;
  provider: StorageProviderName;
}

export type StorageProviderName = 'supabase' | 'cloudinary' | 'local';

export interface StorageProvider {
  readonly name: StorageProviderName;
  upload(input: UploadInput): Promise<StoredFile>;
  remove(storageKey: string): Promise<void>;
}

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;

export const ALLOWED_DOCUMENT_TYPES = ['application/pdf'] as const;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
