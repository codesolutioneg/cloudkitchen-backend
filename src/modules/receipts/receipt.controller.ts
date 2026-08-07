import { Request, Response } from 'express';
import { prisma } from '../../prisma/client';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../core/errors/AppError';
import { getRequestActor } from '../../core/middleware/requestContext';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { config } from '../../config';

const UPLOAD_ROOT = config.UPLOAD_PATH ?? './uploads';

async function getReceiptFile(orderId: string, companyId?: string) {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      is_deleted: false,
      ...(companyId ? { company_id: companyId } : {}),
    },
    include: { payment: true },
  });
  if (!order) throw new NotFoundError('Order not found');
  if (!order.payment || order.payment.status !== 'approved') {
    throw new BadRequestError('Receipt is available only after payment approval');
  }
  if (!order.payment.receipt_file_id) {
    throw new NotFoundError('Receipt not generated yet');
  }

  const file = await prisma.file.findUnique({ where: { id: order.payment.receipt_file_id } });
  if (!file) throw new NotFoundError('Receipt file not found');
  return file;
}

export async function downloadCompanyReceipt(req: Request, res: Response): Promise<void> {
  const actor = getRequestActor();
  if (actor?.type !== 'company_user' || !actor.companyId) {
    throw new ForbiddenError('Company authentication required');
  }
  const file = await getReceiptFile(req.params.id!, actor.companyId);
  const abs = path.join(UPLOAD_ROOT, file.storage_key);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);
  createReadStream(abs).pipe(res);
}

export async function downloadDashboardReceipt(req: Request, res: Response): Promise<void> {
  const file = await getReceiptFile(req.params.id!);
  const abs = path.join(UPLOAD_ROOT, file.storage_key);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);
  createReadStream(abs).pipe(res);
}
