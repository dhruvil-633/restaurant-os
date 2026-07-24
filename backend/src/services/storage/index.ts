import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { cloudinaryProvider } from './cloudinaryProvider';
import { localDiskProvider } from './localDisk';
import { supabaseStorageProvider } from './supabaseProvider';
import type { StorageProvider, StoredFile, UploadInput } from './types';

/**
 * Provider is resolved once at import time in priority order. Adding credentials
 * to the environment switches provider on the next boot with no code change.
 */
function resolveProvider(): StorageProvider {
  if (env.hasSupabaseStorage) return supabaseStorageProvider;
  if (env.hasCloudinary) return cloudinaryProvider;
  return localDiskProvider;
}

const provider = resolveProvider();

if (provider.name === 'local' && env.isProduction) {
  logger.warn(
    'Uploads are writing to local disk in production. Render’s filesystem is ephemeral — ' +
      'set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or the Cloudinary keys) to persist images.',
  );
}

export const storage = {
  get providerName(): string {
    return provider.name;
  },
  upload(input: UploadInput): Promise<StoredFile> {
    return provider.upload(input);
  },
  async remove(storageKey: string | null | undefined): Promise<void> {
    if (!storageKey) return;
    try {
      await provider.remove(storageKey);
    } catch (error) {
      // A failed cleanup must never fail the request that triggered it.
      logger.warn(`Could not remove stored file ${storageKey}`, error);
    }
  },
};

export function describeStorageProvider(): string {
  const descriptions: Record<string, string> = {
    supabase: `Supabase Storage (bucket: ${env.SUPABASE_STORAGE_BUCKET})`,
    cloudinary: 'Cloudinary',
    local: 'local disk (./uploads) — no cloud credentials configured',
  };
  return descriptions[provider.name] ?? provider.name;
}

export * from './types';
