import { Request, Response } from 'express';
import * as service from './business-rules.service';
import { sendSuccess } from '../../core/utils/response';

export async function listRuleTypes(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listRuleTypes());
}

export async function createRuleType(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createRuleType(req.body), 201);
}

export async function updateRuleType(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updateRuleType(req.params.id!, req.body));
}

export async function listBusinessRules(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.listBusinessRules({
      ruleTypeCode: req.query.ruleTypeCode as string | undefined,
      scopeType: req.query.scopeType as string | undefined,
    }),
  );
}

export async function createBusinessRule(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createBusinessRule(req.body), 201);
}

export async function updateBusinessRule(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updateBusinessRule(req.params.id!, req.body));
}

export async function deleteBusinessRule(req: Request, res: Response): Promise<void> {
  await service.deleteBusinessRule(req.params.id!);
  res.status(204).send();
}

export async function resolveBusinessRule(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.resolveBusinessRule({
      ruleTypeCode: req.query.ruleTypeCode as string,
      companyId: req.query.companyId as string,
      departmentId: req.query.departmentId as string | undefined,
      userId: req.query.userId as string | undefined,
      productId: req.query.productId as string | undefined,
      categoryId: req.query.categoryId as string | undefined,
    }),
  );
}

export async function listCalendars(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.listCalendars({
      companyId: req.query.companyId as string | undefined,
    }),
  );
}

export async function createCalendar(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createCalendar(req.body), 201);
}

export async function updateCalendar(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updateCalendar(req.params.id!, req.body));
}

export async function listCalendarEvents(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listCalendarEvents(req.params.id!));
}

export async function createCalendarEvent(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createCalendarEvent(req.params.id!, req.body), 201);
}

export async function updateCalendarEvent(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.updateCalendarEvent(req.params.id!, req.params.eventId!, req.body),
  );
}
