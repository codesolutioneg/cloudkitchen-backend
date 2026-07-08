import multer from 'multer';
import { BadRequestError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(
      new BadRequestError(
        `Unsupported file type: ${file.mimetype}`,
        ErrorCodes.UNSUPPORTED_FILE_TYPE,
      ) as unknown as null,
      false,
    );
  },
});

export { ALLOWED_MIMES, MAX_FILE_SIZE };
