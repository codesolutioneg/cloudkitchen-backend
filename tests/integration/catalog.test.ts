import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { bearer, loginDashboardUser, registerCompany, loginCompanyUser } from '../helpers/auth';

describe('Catalog PIM', () => {
  it('dashboard creates and lists categories', async () => {
    const dash = await loginDashboardUser();
    const token = dash.body.data.accessToken as string;
    const suffix = Date.now();

    const create = await request(app)
      .post('/api/v1/dashboard/catalog/categories')
      .set(bearer(token))
      .send({
        name: `Beverages ${suffix}`,
        slug: `beverages-${suffix}`,
        sortOrder: 1,
      });

    expect(create.status).toBe(201);
    expect(create.body.data.slug).toBe(`beverages-${suffix}`);

    const list = await request(app)
      .get('/api/v1/dashboard/catalog/categories')
      .set(bearer(token));

    expect(list.status).toBe(200);
    expect(list.body.data.some((c: { slug: string }) => c.slug === `beverages-${suffix}`)).toBe(
      true,
    );
  });

  it('dashboard creates product with translation', async () => {
    const dash = await loginDashboardUser();
    const token = dash.body.data.accessToken as string;
    const suffix = Date.now();

    const category = await request(app)
      .post('/api/v1/dashboard/catalog/categories')
      .set(bearer(token))
      .send({ name: `Meals ${suffix}`, slug: `meals-${suffix}` });
    const categoryId = category.body.data.id as string;

    const product = await request(app)
      .post('/api/v1/dashboard/catalog/products')
      .set(bearer(token))
      .send({
        categoryId,
        name: `Grilled Chicken ${suffix}`,
        basePrice: '45.00',
        currency: 'SAR',
        visibility: 'public',
      });

    expect(product.status).toBe(201);

    const translation = await request(app)
      .put(`/api/v1/dashboard/catalog/products/${product.body.data.id}/translations/ar`)
      .set(bearer(token))
      .send({ name: 'دجاج مشوي', description: 'وجبة دجاج' });

    expect(translation.status).toBe(200);
    expect(translation.body.data.languageCode).toBe('ar');
  });
});

describe('Company catalog menu', () => {
  it('company user sees assigned menu products only', async () => {
    const suffix = Date.now();
    const dash = await loginDashboardUser();
    const dashToken = dash.body.data.accessToken as string;

    const reg = await registerCompany(`menu-${suffix}`);
    const companyId = reg.body.data.companyId as string;
    const companyLogin = await loginCompanyUser(`user-menu-${suffix}@example.com`, 'SecurePass123!');
    const companyToken = companyLogin.body.data.accessToken as string;

    const category = await request(app)
      .post('/api/v1/dashboard/catalog/categories')
      .set(bearer(dashToken))
      .send({ name: `Menu Cat ${suffix}`, slug: `menu-cat-${suffix}` });

    const product = await request(app)
      .post('/api/v1/dashboard/catalog/products')
      .set(bearer(dashToken))
      .send({
        categoryId: category.body.data.id,
        name: `Menu Item ${suffix}`,
        basePrice: '25.00',
        currency: 'SAR',
        visibility: 'restricted',
      });

    const menu = await request(app)
      .post('/api/v1/dashboard/menus')
      .set(bearer(dashToken))
      .send({ name: `Company Menu ${suffix}`, menuType: 'general' });

    const section = await request(app)
      .post(`/api/v1/dashboard/menus/${menu.body.data.id}/sections`)
      .set(bearer(dashToken))
      .send({ name: 'Main', sortOrder: 0 });

    await request(app)
      .post(
        `/api/v1/dashboard/menus/${menu.body.data.id}/sections/${section.body.data.id}/products`,
      )
      .set(bearer(dashToken))
      .send({ productId: product.body.data.id, sortOrder: 0 });

    await request(app)
      .post(`/api/v1/dashboard/menus/${menu.body.data.id}/assignments`)
      .set(bearer(dashToken))
      .send({ scopeType: 'company', scopeId: companyId, priority: 10 });

    const browse = await request(app)
      .get('/api/v1/company/catalog/menu')
      .set(bearer(companyToken));

    expect(browse.status).toBe(200);
    expect(browse.body.data.sections[0].products[0].name).toContain(`Menu Item ${suffix}`);
  });
});
