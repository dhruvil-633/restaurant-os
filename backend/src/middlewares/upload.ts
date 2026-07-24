import multer from 'multer';
import { ApiError } from '../utils/apiError';
import {
  ALLOWED_DOCUMENT_TYPES,
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
} from '../services/storage';

/**
 * Files are held in memory rather than written to disk, because every storage
 * provider takes a Buffer and Render's filesystem is ephemeral anyway.
 */
function createUploader(allowedTypes: readonly string[]) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter: (_req, file, callback) => {
      if (!allowedTypes.includes(file.mimetype)) {
        callback(
          ApiError.badRequest(
            `Unsupported file type "${file.mimetype}". Allowed: ${allowedTypes.join(', ')}.`,
          ),
        );
        return;
      }
      callback(null, true);
    },
  });
}

export const uploadImage = createUploader(ALLOWED_IMAGE_TYPES).single('image');

export const uploadDocument = createUploader([
  ...ALLOWED_DOCUMENT_TYPES,
  ...ALLOWED_IMAGE_TYPES,
]).single('file');
