import { Request, Response } from 'express';
import * as service from './dashboard-companies.service';
import * as onboardingService from '../company-onboarding/onboarding.service';
import { sendPaginated, sendSuccess } from '../../core/utils/response';
import { ForbiddenError } from '../../core/errors/AppError';

export async function listCompanies(req: Request, res: Response): Promise<void> {
  if (!req.actor) {
    throw new ForbiddenError('Dashboard authentication required');
  }

  const result = await service.listCompanies({
    approvalStatus: req.query.approvalStatus as
      | 'pending'
      | 'under_review'
      | 'approved'
      | 'rejected'
      | 'resubmission_required'
      | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    dashboardUserId: req.actor.id,
  });

  sendPaginated(res, result.items, result.pagination);
}

export async function getCompany(req: Request, res: Response): Promise<void> {
  if (!req.actor) {
    throw new ForbiddenError('Dashboard authentication required');
  }

  sendSuccess(res, await service.getCompany(req.params.id!, req.actor.id));
}

export async function listCompanyDocuments(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listCompanyDocuments(req.params.id!));
}

export async function approveCompany(req: Request, res: Response): Promise<void> {
  if (!req.actor) {
    throw new ForbiddenError('Dashboard authentication required');
  }

  const result = await service.approveCompany(req.params.id!, req.actor, req.body.reason);
  sendSuccess(res, result);
}

export async function rejectCompany(req: Request, res: Response): Promise<void> {
  if (!req.actor) {
    throw new ForbiddenError('Dashboard authentication required');
  }

  const result = await service.rejectCompany(req.params.id!, req.actor, req.body.reason);
  sendSuccess(res, result);
}

export async function verifyDocument(req: Request, res: Response): Promise<void> {
  if (!req.actor) {
    throw new ForbiddenError('Dashboard authentication required');
  }

  const result = await onboardingService.verifyCompanyDocument(
    req.params.id!,
    req.params.attachmentId!,
    req.body.verificationStatus,
    req.actor,
  );

  sendSuccess(res, result);
}
