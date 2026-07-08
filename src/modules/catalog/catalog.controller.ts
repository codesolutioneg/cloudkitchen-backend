import { Request, Response } from 'express';
import * as service from './catalog.service';
import * as imageService from './catalog.image.service';
import { sendPaginated, sendSuccess } from '../../core/utils/response';
import { BadRequestError } from '../../core/errors/AppError';

export async function listCategories(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listCategories());
}

export async function createCategory(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createCategory(req.body), 201);
}

export async function updateCategory(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updateCategory(req.params.id!, req.body));
}

export async function deleteCategory(req: Request, res: Response): Promise<void> {
  await service.deleteCategory(req.params.id!);
  res.status(204).send();
}

export async function listProducts(req: Request, res: Response): Promise<void> {
  const result = await service.listProducts({
    categoryId: req.query.categoryId as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  });
  sendPaginated(res, result.items, result.pagination);
}

export async function getProduct(req: Request, res: Response): Promise<void> {
  const acceptLanguage = req.headers['accept-language'];
  const langFromHeader =
    typeof acceptLanguage === 'string' ? acceptLanguage.split(',')[0]?.trim().split('-')[0] : undefined;
  const languageCode = (req.query.lang as string | undefined) ?? langFromHeader;
  sendSuccess(res, await service.getProduct(req.params.id!, languageCode));
}

export async function createProduct(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createProduct(req.body), 201);
}

export async function updateProduct(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updateProduct(req.params.id!, req.body));
}

export async function deleteProduct(req: Request, res: Response): Promise<void> {
  await service.deleteProduct(req.params.id!);
  res.status(204).send();
}

export async function upsertProductTranslation(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.upsertProductTranslation(req.params.id!, req.params.lang!, req.body),
  );
}

export async function createVariant(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createVariant(req.params.id!, req.body), 201);
}

export async function listVariants(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listVariants(req.params.id!));
}

export async function updateVariant(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.updateVariant(req.params.id!, req.params.variantId!, req.body),
  );
}

export async function createOptionGroup(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createOptionGroup(req.params.id!, req.body), 201);
}

export async function listOptionGroups(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listOptionGroups(req.params.id!));
}

export async function updateOptionGroup(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.updateOptionGroup(req.params.id!, req.params.groupId!, req.body),
  );
}

export async function createAvailability(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createAvailability(req.params.id!, req.body), 201);
}

export async function listAvailability(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listAvailability(req.params.id!));
}

export async function updateAvailability(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.updateAvailability(req.params.id!, req.params.availabilityId!, req.body),
  );
}

export async function deleteAvailability(req: Request, res: Response): Promise<void> {
  await service.deleteAvailability(req.params.id!, req.params.availabilityId!);
  res.status(204).send();
}

export async function addProductTag(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.addProductTag(req.params.id!, req.body.tagName), 201);
}

export async function listProductTags(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listProductTags(req.params.id!));
}

export async function removeProductTag(req: Request, res: Response): Promise<void> {
  await service.removeProductTag(req.params.id!, req.params.tagId!);
  res.status(204).send();
}

export async function listPricingLists(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listPricingLists());
}

export async function createPricingList(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createPricingList(req.body), 201);
}

export async function createPrice(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createPrice(req.body), 201);
}

export async function assignCompanyPricingList(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.assignCompanyPricingList(req.body), 201);
}

export async function getCompanyCatalogMenu(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getCompanyCatalogMenu());
}

export async function uploadProductImage(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw new BadRequestError('Image file is required (field "file")');
  }
  sendSuccess(res, await imageService.uploadProductImage(req.params.id!, req.file), 201);
}

export async function setProductImageUrl(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await imageService.setProductImageUrl(req.params.id!, req.body.imageUrl));
}

export async function listProductMedia(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await imageService.listProductMedia(req.params.id!));
}

export async function deleteProductMedia(req: Request, res: Response): Promise<void> {
  await imageService.deleteProductMedia(req.params.id!, req.params.mediaId!);
  res.status(204).send();
}
