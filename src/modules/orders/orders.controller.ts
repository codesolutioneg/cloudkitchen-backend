import { Request, Response } from 'express';
import * as service from './orders.service';
import * as paymentService from './order-payment.service';
import * as scheduleService from './orders-schedule.service';
import { sendPaginated, sendSuccess } from '../../core/utils/response';
import { getRequestActor } from '../../core/middleware/requestContext';
import { ForbiddenError } from '../../core/errors/AppError';

export async function createOrder(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createOrder(req.body), 201);
}

export async function listCompanyOrders(req: Request, res: Response): Promise<void> {
  const result = await service.listCompanyOrders({
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  });
  sendPaginated(res, result.items, result.pagination);
}

export async function getCompanyOrder(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getCompanyOrder(req.params.id!));
}

export async function cancelCompanyOrder(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.cancelCompanyOrder(req.params.id!, req.body.reasonText));
}

export async function getOrderTracking(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getOrderTracking(req.params.id!));
}

export async function addCompanyOrderNote(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.addCompanyOrderNote(req.params.id!, req.body.note), 201);
}

export async function decideCompanyOrderApproval(req: Request, res: Response): Promise<void> {
  const actor = getRequestActor();
  if (!actor) {
    throw new ForbiddenError('Authentication required');
  }
  sendSuccess(
    res,
    await service.decideOrderApproval(
      req.params.id!,
      Number(req.params.level),
      req.body,
      actor,
    ),
  );
}

export async function listDashboardOrders(req: Request, res: Response): Promise<void> {
  const actor = getRequestActor();
  const result = await service.listDashboardOrders({
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    companyId: req.query.companyId as string | undefined,
    statusCode: req.query.statusCode as string | undefined,
    dashboardUserId: actor?.id,
  });
  sendPaginated(res, result.items, result.pagination);
}

export async function getDashboardOrder(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getDashboardOrder(req.params.id!));
}

export async function updateDashboardOrder(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updateDashboardOrder(req.params.id!, req.body));
}

export async function transitionDashboardOrder(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.transitionDashboardOrder(req.params.id!, req.body));
}

export async function addDashboardOrderNote(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.addDashboardOrderNote(req.params.id!, req.body),
    201,
  );
}

export async function decideDashboardOrderApproval(req: Request, res: Response): Promise<void> {
  const actor = getRequestActor();
  if (!actor) {
    throw new ForbiddenError('Authentication required');
  }
  sendSuccess(
    res,
    await service.decideOrderApproval(
      req.params.id!,
      Number(req.params.level),
      req.body,
      actor,
    ),
  );
}

export async function scheduleOrders(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await scheduleService.scheduleOrders(req.body), 201);
}

export async function getOrderCalendar(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await scheduleService.getOrderCalendar({
      from: req.query.from as string,
      to: req.query.to as string,
    }),
  );
}

export async function submitPaymentProof(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await paymentService.submitPaymentProof(req.params.id!, req.body.proofAttachmentId));
}

export async function approvePayment(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await paymentService.approvePayment(req.params.id!, req.body.comment));
}

export async function rejectPayment(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await paymentService.rejectPayment(req.params.id!, req.body.reason));
}

export async function getOrderPayment(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await paymentService.getOrderPayment(req.params.id!));
}
