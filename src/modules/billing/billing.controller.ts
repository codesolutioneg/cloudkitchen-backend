import { Request, Response } from 'express';
import * as service from './billing.service';
import { sendSuccess } from '../../core/utils/response';
import { BadRequestError } from '../../core/errors/AppError';

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function getCompanyTerms(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getCompanyTerms(req.params.companyId!));
}

export async function setCompanyTerms(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.setCompanyTerms(req.params.companyId!, req.body));
}

export async function listInvoices(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.listInvoices({
      companyId: req.query.companyId as string | undefined,
      status: req.query.status as string | undefined,
    }),
  );
}

export async function getInvoice(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getInvoice(req.params.id!));
}

export async function generateInvoice(req: Request, res: Response): Promise<void> {
  const invoice = await service.generateInvoiceForPeriod(req.params.companyId!, req.body);
  if (!invoice) {
    throw new BadRequestError('No uninvoiced orders in that period');
  }
  sendSuccess(res, invoice, 201);
}

export async function createPlanInstalments(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createPlanInstalments(req.params.id!, req.body), 201);
}

export async function decideInstalment(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.decideInstalment(req.params.instalmentId!, req.body));
}

export async function recordInvoicePayment(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.recordInvoicePayment(req.params.id!, req.body.amount));
}

export async function markOverdue(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.markOverdue());
}

// ── Company ───────────────────────────────────────────────────────────────────

export async function getMyTerms(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getMyTerms());
}

export async function getMyBillingSummary(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getMyBillingSummary());
}

export async function listMyInvoices(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listMyInvoices());
}

export async function getMyInvoice(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getMyInvoice(req.params.id!));
}

export async function submitInstalmentProof(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.submitInstalmentProof(req.params.instalmentId!, req.body.proofAttachmentId),
  );
}
