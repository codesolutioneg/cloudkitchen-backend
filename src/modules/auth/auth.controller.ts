import { Request, Response } from 'express';
import * as authService from './auth.service';
import { sendSuccess } from '../../core/utils/response';

function requestMeta(req: Request) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}

export async function companyLogin(req: Request, res: Response): Promise<void> {
  const tokens = await authService.companyLogin(req.body.email, req.body.password, requestMeta(req));
  sendSuccess(res, tokens);
}

export async function companyOtpSend(req: Request, res: Response): Promise<void> {
  await authService.companySendOtp(req.body.email, req.body.purpose);
  res.status(204).send();
}

export async function companyOtpVerify(req: Request, res: Response): Promise<void> {
  const tokens = await authService.companyVerifyOtp(
    req.body.email,
    req.body.code,
    req.body.purpose,
    requestMeta(req),
  );
  sendSuccess(res, tokens);
}

export async function companyRefresh(req: Request, res: Response): Promise<void> {
  const tokens = await authService.companyRefresh(req.body.refreshToken);
  sendSuccess(res, tokens);
}

export async function companyLogout(req: Request, res: Response): Promise<void> {
  await authService.companyLogout(req.actor!.id, req.body.refreshToken);
  res.status(204).send();
}

export async function companyProfile(req: Request, res: Response): Promise<void> {
  const profile = await authService.getCompanyProfile(req.actor!.id, req.actor!.companyId!);
  sendSuccess(res, profile);
}

export async function dashboardLogin(req: Request, res: Response): Promise<void> {
  const tokens = await authService.dashboardLogin(
    req.body.email,
    req.body.password,
    requestMeta(req),
  );
  sendSuccess(res, tokens);
}

export async function dashboardOtpSend(req: Request, res: Response): Promise<void> {
  await authService.dashboardSendOtp(req.body.email);
  res.status(204).send();
}

export async function dashboardOtpVerify(req: Request, res: Response): Promise<void> {
  const tokens = await authService.dashboardVerifyOtp(
    req.body.email,
    req.body.code,
    requestMeta(req),
  );
  sendSuccess(res, tokens);
}

export async function dashboardRefresh(req: Request, res: Response): Promise<void> {
  const tokens = await authService.dashboardRefresh(req.body.refreshToken);
  sendSuccess(res, tokens);
}

export async function dashboardLogout(req: Request, res: Response): Promise<void> {
  await authService.dashboardLogout(req.actor!.id, req.body.refreshToken);
  res.status(204).send();
}

export async function dashboardMe(req: Request, res: Response): Promise<void> {
  const me = await authService.getDashboardMe(req.actor!.id);
  sendSuccess(res, me);
}
