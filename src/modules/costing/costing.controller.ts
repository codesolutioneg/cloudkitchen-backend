import { Request, Response } from 'express';
import * as service from './costing.service';
import { sendPaginated, sendSuccess } from '../../core/utils/response';

export async function listSuppliers(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listSuppliers());
}
export async function createSupplier(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createSupplier(req.body), 201);
}

export async function listIngredients(req: Request, res: Response): Promise<void> {
  const result = await service.listIngredients({
    search: req.query.search as string | undefined,
    supplierId: req.query.supplierId as string | undefined,
    categoryId: req.query.categoryId as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  });
  sendPaginated(res, result.items, result.pagination);
}
export async function getIngredient(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getIngredient(req.params.id!));
}
export async function createIngredient(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createIngredient(req.body), 201);
}
export async function updateIngredient(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updateIngredient(req.params.id!, req.body));
}
export async function deleteIngredient(req: Request, res: Response): Promise<void> {
  await service.deleteIngredient(req.params.id!);
  res.status(204).send();
}
export async function bulkUpdatePrices(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.bulkUpdatePrices(req.body));
}
export async function listPriceHistory(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listPriceHistory(req.params.id!));
}

export async function listRecipes(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.listRecipes({
      status: req.query.status as string | undefined,
      recipeType: req.query.recipeType as string | undefined,
      productId: req.query.productId as string | undefined,
    }),
  );
}
export async function getRecipe(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getRecipe(req.params.id!));
}
export async function createRecipe(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createRecipe(req.body), 201);
}
export async function replaceRecipeLines(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.replaceRecipeLines(req.params.id!, req.body.lines));
}
export async function setRecipeStatus(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.setRecipeStatus(req.params.id!, req.body.status));
}

export async function listProductCosts(req: Request, res: Response): Promise<void> {
  const result = await service.listProductCosts({
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    costStatus: req.query.costStatus as string | undefined,
  });
  sendPaginated(res, result.items, result.pagination);
}
export async function getCostingSummary(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getCostingSummary());
}
export async function setManualCost(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.setManualCost(req.params.id!, req.body));
}
export async function recostAll(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.recostAll());
}
