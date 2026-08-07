import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import { dashboardAuthMiddleware } from '../../core/middleware/companyAuthMiddleware';
import { assistantChatSchema } from './assistant.schemas';
import * as controller from './assistant.controller';

const router = Router();
const auth = dashboardAuthMiddleware;

const assistantLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'طلبات كثيرة — انتظر قليلاً.' } },
});

router.post(
  '/dashboard/assistant/chat',
  auth,
  assistantLimiter,
  validate(assistantChatSchema),
  asyncHandler(controller.chat),
);

export default router;
