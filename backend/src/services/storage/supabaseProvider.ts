import crypto from 'node:crypto';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/env';
import type { StorageProvider, StoredFile, UploadInput } from './types';

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!client) {
    // The service-role key bypasses row-level security, which is what a trusted
    // backend needs. It must never be exposed to the browser.
    client = createClient(env.SUPABASE_URL as string, env.SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export const supabaseStorageProvider: StorageProvider = {
  name: 'supabase',

  async upload(input: UploadInput): Promise<StoredFile> {
    const extension = path.extname(input.originalName).toLowerCase();
    const objectPath = `${input.folder}/${Date.now()}-${crypto
      .randomBytes(8)
      .toString('hex')}${extension}`;

    const { error } = await getClient()
      .storage.from(env.SUPABASE_STORAGE_BUCKET)
      .upload(objectPath, input.buffer, {
        contentType: input.mimeType,
        cacheControl: '2592000',
        upsert: false,
      });

    if (error) {
      throw new Error(`Supabase storage upload failed: ${error.message}`);
    }

    const { data } = getClient()
      .storage.from(env.SUPABASE_STORAGE_BUCKET)
      .getPublicUrl(objectPath);

    return { url: data.publicUrl, storageKey: objectPath, provider: 'supabase' };
  },

  async remove(storageKey: string): Promise<void> {
    await getClient().storage.from(env.SUPABASE_STORAGE_BUCKET).remove([storageKey]);
  },
};
