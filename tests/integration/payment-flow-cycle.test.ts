import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { bearer, loginDashboardUser, registerCompany } from '../helpers/auth';
import { prisma } from '../../src/prisma/client';

const SUFFIX = `pay-${Date.now()}`;

describe('Payment proof cycle', () => {
  let dashToken: string;
  let companyToken: string;
  let companyId: string;
  let orderId: string;

  beforeAll(async () => {
    const dash = await loginDashboardUser();
    dashToken = dash.body.data.accessToken as string;

    // This suite used to sign in as a real account that only exists on the
    // production database, so it could never pass anywhere else. It now brings
    // its own company, like every other suite.
    const registration = await registerCompany(SUFFIX);
    const registeredCompanyId = registration.body.data.companyId as string;
    await request(app)
      .post(`/api/v1/dashboard/companies/${registeredCompanyId}/approve`)
      .set(bearer(dashToken))
      .send({ reason: 'payment flow test' });

    const login = await request(app)
      .post('/api/v1/auth/company/login')
      .send({ email: `user-${SUFFIX}@example.com`, password: 'SecurePass123!' });

    companyToken = login.body.data.accessToken as string;

    const profile = await request(app)
      .get('/api/v1/company/profile')
      .set(bearer(companyToken));
    companyId = profile.body.data.company.id as string;

    // A fresh company has no catalog, so give it one it can order from.
    const category = await request(app)
      .post('/api/v1/dashboard/catalog/categories')
      .set(bearer(dashToken))
      .send({ name: `Pay ${SUFFIX}`, slug: `pay-${SUFFIX}` });
    const product = await request(app)
      .post('/api/v1/dashboard/catalog/products')
      .set(bearer(dashToken))
      .send({
        categoryId: category.body.data.id,
        name: `Pay dish ${SUFFIX}`,
        basePrice: '600.00',
        currency: 'EGP',
        visibility: 'public',
      });
    const testMenu = await request(app)
      .post('/api/v1/dashboard/menus')
      .set(bearer(dashToken))
      .send({ name: `Pay menu ${SUFFIX}`, menuType: 'standard', isActive: true });
    const section = await request(app)
      .post(`/api/v1/dashboard/menus/${testMenu.body.data.id}/sections`)
      .set(bearer(dashToken))
      .send({ name: 'All', sortOrder: 1 });
    await request(app)
      .post(`/api/v1/dashboard/menus/${testMenu.body.data.id}/sections/${section.body.data.id}/products`)
      .set(bearer(dashToken))
      .send({ productId: product.body.data.id, sortOrder: 1 });
    await request(app)
      .post(`/api/v1/dashboard/menus/${testMenu.body.data.id}/assignments`)
      .set(bearer(dashToken))
      .send({ scopeType: 'company', scopeId: companyId, priority: 100 });

    const menu = await request(app)
      .get('/api/v1/company/catalog/menu')
      .set(bearer(companyToken));

    const sections = menu.body.data.sections as Array<{ products?: Array<{ id: string; price?: string; basePrice?: string }> }>;
    const items: Array<{ productId: string; quantity: number }> = [];
    let total = 0;
    for (const s of sections) {
      for (const p of s.products ?? []) {
        const price = Number(p.price ?? p.basePrice ?? 0);
        const qty = Math.max(1, Math.ceil(400 / Math.max(price, 1)));
        items.push({ productId: p.id, quantity: qty });
        total += price * qty;
        if (items.length >= 3 || total >= 1100) break;
      }
      if (items.length >= 3 || total >= 1100) break;
    }
    expect(items.length).toBeGreaterThan(0);

    const addresses = await request(app)
      .get('/api/v1/company/onboarding/addresses')
      .set(bearer(companyToken));
    const deliveryAddressId = (addresses.body.data as Array<{ id: string; addressType: string }>).find(
      (a) => a.addressType === 'delivery',
    )?.id;

    const create = await request(app)
      .post('/api/v1/company/orders')
      .set(bearer(companyToken))
      .send({
        items,
        fulfillmentType: 'delivery',
        sourceChannel: 'web',
        ...(deliveryAddressId ? { deliveryAddressId } : {}),
        requestedDeliveryAt: '2026-08-15T12:00:00.000Z',
      });

    expect(create.status, JSON.stringify(create.body)).toBe(201);
    orderId = create.body.data.id as string;
  });

  it('company lists order with payment flags', async () => {
    const res = await request(app).get('/api/v1/company/orders').set(bearer(companyToken));
    expect(res.status).toBe(200);
    const row = (res.body.data as Array<{ id: string; needsPaymentProof?: boolean }>).find(
      (o) => o.id === orderId,
    );
    expect(row).toBeTruthy();
    expect(row?.needsPaymentProof).toBe(true);
  });

  it('company uploads payment proof and dashboard approves', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    const upload = await request(app)
      .post('/api/v1/files')
      .set(bearer(companyToken))
      .field('entityType', 'order')
      .field('entityId', orderId)
      .field('attachmentType', 'payment_proof')
      .attach('file', png, { filename: 'proof.png', contentType: 'image/png' });

    expect(upload.status).toBe(201);
    const fileId = upload.body.data.id as string;

    const attach = await request(app)
      .post(`/api/v1/company/orders/${orderId}/payment-proof`)
      .set(bearer(companyToken))
      .send({ proofAttachmentId: fileId });

    expect(attach.status).toBe(200);

    const approve = await request(app)
      .post(`/api/v1/dashboard/orders/${orderId}/payment/approve`)
      .set(bearer(dashToken))
      .send({ comment: 'E2E approved' });

    expect(approve.status).toBe(200);

    const detail = await request(app)
      .get(`/api/v1/company/orders/${orderId}`)
      .set(bearer(companyToken));

    expect(detail.status).toBe(200);
    expect(detail.body.data.payment?.status).toBe('approved');
  });

  it('blocks company user from accessing another company order file', async () => {
    const otherCompany = await prisma.company.findFirst({
      where: { id: { not: companyId }, is_deleted: false, approval_status: 'approved' },
      select: { id: true },
    });
    if (!otherCompany) return;

    const otherOrder = await prisma.order.findFirst({
      where: { company_id: otherCompany.id, is_deleted: false },
      select: { id: true },
    });
    if (!otherOrder) return;

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    const upload = await request(app)
      .post('/api/v1/files')
      .set(bearer(companyToken))
      .field('entityType', 'order')
      .field('entityId', otherOrder.id)
      .field('attachmentType', 'payment_proof')
      .attach('file', png, { filename: 'proof.png', contentType: 'image/png' });

    expect([403, 404]).toContain(upload.status);
  });
});

describe('Pricing assignment delete', () => {
  it('dashboard deletes pricing assignment', async () => {
    const dash = await loginDashboardUser();
    const dashToken = dash.body.data.accessToken as string;

    const companies = await request(app)
      .get('/api/v1/dashboard/companies?page=1&pageSize=5&approvalStatus=approved')
      .set(bearer(dashToken));

    const companyId = companies.body.data[0]?.id as string;
    expect(companyId).toBeTruthy();

    const lists = await request(app)
      .get('/api/v1/dashboard/catalog/pricing-lists')
      .set(bearer(dashToken));
    const pricingListId = lists.body.data[0]?.id as string;
    expect(pricingListId).toBeTruthy();

    const create = await request(app)
      .post('/api/v1/dashboard/catalog/company-assignment')
      .set(bearer(dashToken))
      .send({ companyId, pricingListId });

    expect(create.status).toBe(201);
    const assignmentId = create.body.data.id as string;

    const del = await request(app)
      .delete(`/api/v1/dashboard/catalog/company-assignment/${assignmentId}`)
      .set(bearer(dashToken));

    expect(del.status).toBe(204);
  });
});
