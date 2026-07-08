import { Request, Response } from 'express';
import * as service from './fulfillment.service';
import { sendSuccess } from '../../core/utils/response';

export async function getCompanyFulfillmentQr(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getCompanyFulfillmentQr(req.params.id!));
}

export async function assignDeliveryUser(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.assignDeliveryUser(req.params.id!, req.body.deliveryUserId));
}

export async function listMyDeliveryOrders(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listMyDeliveryOrders());
}

export async function listAssignableDeliveryUsers(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listAssignableDeliveryUsers());
}

export async function departForDelivery(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.departForDelivery(req.params.id!));
}

export async function confirmDeliveryByQr(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.confirmDeliveryByQr(req.params.id!, req.body.qrToken));
}

export async function markAwaitingPickup(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.markAwaitingPickup(req.params.id!));
}

export async function confirmPickup(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.confirmPickup(req.params.id!));
}
