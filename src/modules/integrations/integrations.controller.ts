import { Request, Response } from 'express';
import * as service from './integrations.service';
import { sendPaginated, sendSuccess } from '../../core/utils/response';

export async function listSystems(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listExternalSystems());
}

export async function createSystem(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createExternalSystem(req.body), 201);
}

export async function updateSystem(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updateExternalSystem(req.params.id!, req.body));
}

export async function listMappings(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listSystemMappings(req.params.id!));
}

export async function listEvents(req: Request, res: Response): Promise<void> {
  const result = await service.listIntegrationEvents({
    status: req.query.status as string | undefined,
    entityType: req.query.entityType as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  });
  sendPaginated(res, result.items, result.pagination);
}
