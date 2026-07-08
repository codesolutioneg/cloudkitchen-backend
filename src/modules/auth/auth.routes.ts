import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import { otpRateLimiter } from '../../core/middleware/otpRateLimiter';
import {
  companyAuthMiddleware,
  dashboardAuthMiddleware,
  rejectWrongAudience,
} from '../../core/middleware/companyAuthMiddleware';
import {
  companyLoginSchema,
  companyOtpSendSchema,
  companyOtpVerifySchema,
  dashboardLoginSchema,
  dashboardOtpSendSchema,
  dashboardOtpVerifySchema,
  refreshTokenSchema,
} from './auth.schemas';
import * as controller from './auth.controller';

const router = Router();

router.post(
  '/auth/company/login',
  rejectWrongAudience('company'),
  otpRateLimiter,
  validate(companyLoginSchema),
  asyncHandler(controller.companyLogin),
);

router.post(
  '/auth/company/otp/send',
  otpRateLimiter,
  validate(companyOtpSendSchema),
  asyncHandler(controller.companyOtpSend),
);

router.post(
  '/auth/company/otp/verify',
  validate(companyOtpVerifySchema),
  asyncHandler(controller.companyOtpVerify),
);

router.post(
  '/auth/company/refresh',
  validate(refreshTokenSchema),
  asyncHandler(controller.companyRefresh),
);

router.post(
  '/auth/company/logout',
  companyAuthMiddleware,
  validate(refreshTokenSchema),
  asyncHandler(controller.companyLogout),
);

router.get(
  '/company/profile',
  companyAuthMiddleware,
  asyncHandler(controller.companyProfile),
);

router.post(
  '/auth/dashboard/login',
  rejectWrongAudience('dashboard'),
  otpRateLimiter,
  validate(dashboardLoginSchema),
  asyncHandler(controller.dashboardLogin),
);

router.post(
  '/auth/dashboard/otp/send',
  otpRateLimiter,
  validate(dashboardOtpSendSchema),
  asyncHandler(controller.dashboardOtpSend),
);

router.post(
  '/auth/dashboard/otp/verify',
  validate(dashboardOtpVerifySchema),
  asyncHandler(controller.dashboardOtpVerify),
);

router.post(
  '/auth/dashboard/refresh',
  validate(refreshTokenSchema),
  asyncHandler(controller.dashboardRefresh),
);

router.post(
  '/auth/dashboard/logout',
  dashboardAuthMiddleware,
  validate(refreshTokenSchema),
  asyncHandler(controller.dashboardLogout),
);

router.get(
  '/auth/dashboard/me',
  dashboardAuthMiddleware,
  asyncHandler(controller.dashboardMe),
);

export default router;
