import multer from 'multer';
import { BadRequestError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';
import { MAX_FILE_SIZE } from './upload';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const uploadImageMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIMES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(
      new BadRequestError(
        `Unsupported image type: ${file.mimetype}`,
        ErrorCodes.UNSUPPORTED_FILE_TYPE,
      ) as unknown as null,
      false,
    );
  },
});
