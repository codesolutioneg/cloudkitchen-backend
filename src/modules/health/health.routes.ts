import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { sendSuccess } from '../../core/utils/response';

const router = Router();

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { status: 'ok' as const });
  }),
);

export default router;
