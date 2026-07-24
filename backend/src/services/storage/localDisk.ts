import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../config/logger';
import type { StorageProvider, StoredFile, UploadInput } from './types';

const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');

function safeExtension(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}

/**
 * Development fallback. Files land in `backend/uploads` and are served by the
 * static handler in app.ts, so image URLs work without any cloud account.
 */
export const localDiskProvider: StorageProvider = {
  name: 'local',

  async upload(input: UploadInput): Promise<StoredFile> {
    const folder = input.folder.replace(/[^a-z0-9-]/gi, '');
    const directory = path.join(UPLOAD_ROOT, folder);
    await fs.mkdir(directory, { recursive: true });

    const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExtension(
      input.originalName,
    )}`;
    await fs.writeFile(path.join(directory, filename), input.buffer);

    const relativePath = `/uploads/${folder}/${filename}`;
    return { url: relativePath, storageKey: relativePath, provider: 'local' };
  },

  async remove(storageKey: string): Promise<void> {
    // Reject anything that tries to escape the uploads directory.
    const target = path.resolve(process.cwd(), `.${storageKey}`);
    if (!target.startsWith(UPLOAD_ROOT)) {
      logger.warn(`Refusing to delete file outside uploads directory: ${storageKey}`);
      return;
    }
    await fs.rm(target, { force: true });
  },
};
