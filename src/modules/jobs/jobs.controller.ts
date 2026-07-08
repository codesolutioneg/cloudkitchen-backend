import { Request, Response } from 'express';
import * as service from './jobs.service';
import { sendPaginated, sendSuccess } from '../../core/utils/response';

export async function listJobs(req: Request, res: Response): Promise<void> {
  const result = await service.listJobs({
    status: req.query.status as string | undefined,
    jobType: req.query.jobType as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  });
  sendPaginated(res, result.items, result.pagination);
}

export async function getJob(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getJob(req.params.id!));
}

export async function retryJob(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.retryJob(req.params.id!));
}

export async function cancelJob(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.cancelJob(req.params.id!));
}
