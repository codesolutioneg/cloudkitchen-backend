import { Request, Response } from 'express';
import * as service from './audit.service';
import { sendPaginated } from '../../core/utils/response';

export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  const result = await service.listAuditLogs({
    entityName: req.query.entityName as string | undefined,
    entityId: req.query.entityId as string | undefined,
    correlationId: req.query.correlationId as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  });
  sendPaginated(res, result.items, result.pagination);
}
