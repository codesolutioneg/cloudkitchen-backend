import { Request, Response } from 'express';
import * as service from './menus.service';
import { sendSuccess } from '../../core/utils/response';

export async function listMenus(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listMenus());
}

export async function getMenu(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getMenu(req.params.id!));
}

export async function createMenu(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createMenu(req.body), 201);
}

export async function updateMenu(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updateMenu(req.params.id!, req.body));
}

export async function deleteMenu(req: Request, res: Response): Promise<void> {
  await service.deleteMenu(req.params.id!);
  res.status(204).send();
}

export async function listSections(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listSections(req.params.id!));
}

export async function createSection(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createSection(req.params.id!, req.body), 201);
}

export async function updateSection(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.updateSection(req.params.id!, req.params.sectionId!, req.body),
  );
}

export async function deleteSection(req: Request, res: Response): Promise<void> {
  await service.deleteSection(req.params.id!, req.params.sectionId!);
  res.status(204).send();
}

export async function addProductToSection(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.addProductToSection(req.params.id!, req.params.sectionId!, req.body),
    201,
  );
}

export async function removeProductFromSection(req: Request, res: Response): Promise<void> {
  await service.removeProductFromSection(
    req.params.id!,
    req.params.sectionId!,
    req.params.productId!,
  );
  res.status(204).send();
}

export async function listSectionProducts(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listSectionProducts(req.params.id!, req.params.sectionId!));
}

export async function createAssignment(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createAssignment(req.params.id!, req.body), 201);
}

export async function listAssignments(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listAssignments(req.params.id!));
}

export async function deleteAssignment(req: Request, res: Response): Promise<void> {
  await service.deleteAssignment(req.params.id!, req.params.assignmentId!);
  res.status(204).send();
}
