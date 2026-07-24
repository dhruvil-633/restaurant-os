import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { env } from '../../config/env';
import type { StorageProvider, StoredFile, UploadInput } from './types';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const cloudinaryProvider: StorageProvider = {
  name: 'cloudinary',

  async upload(input: UploadInput): Promise<StoredFile> {
    const isPdf = input.mimeType === 'application/pdf';

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `restaurant-os/${input.folder}`,
          resource_type: isPdf ? 'raw' : 'image',
          // Cloudinary serves an optimised, correctly sized asset from one upload.
          transformation: isPdf
            ? undefined
            : [{ quality: 'auto:good', fetch_format: 'auto', width: 1600, crop: 'limit' }],
        },
        (error, response) => {
          if (error || !response) {
            reject(error ?? new Error('Cloudinary upload returned no response'));
            return;
          }
          resolve(response);
        },
      );
      stream.end(input.buffer);
    });

    return {
      url: result.secure_url,
      storageKey: result.public_id,
      provider: 'cloudinary',
    };
  },

  async remove(storageKey: string): Promise<void> {
    await cloudinary.uploader.destroy(storageKey);
  },
};
