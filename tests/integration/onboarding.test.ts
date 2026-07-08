import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';

describe('POST /api/v1/company/onboarding/register', () => {
  it('creates a pending company and primary contact user', async () => {
    const suffix = Date.now();
    const res = await request(app)
      .post('/api/v1/company/onboarding/register')
      .send({
        legalName: `Test Kitchen ${suffix}`,
        countryCode: 'SA',
        primaryContactName: 'Ahmed Ali',
        primaryEmail: `company-${suffix}@example.com`,
        primaryPhone: '+966500000001',
        userFullName: 'Ahmed Ali',
        userEmail: `user-${suffix}@example.com`,
        password: 'SecurePass123!',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      companyId: expect.any(String),
      companyUserId: expect.any(String),
      legalName: `Test Kitchen ${suffix}`,
      approvalStatus: 'pending',
      userEmail: `user-${suffix}@example.com`,
    });
  });

  it('rejects duplicate user email', async () => {
    const suffix = Date.now();
    const payload = {
      legalName: `Dup Kitchen ${suffix}`,
      countryCode: 'SA',
      primaryContactName: 'Sara',
      primaryEmail: `dup-company-${suffix}@example.com`,
      primaryPhone: '+966500000002',
      userFullName: 'Sara',
      userEmail: `dup-user-${suffix}@example.com`,
      password: 'SecurePass123!',
    };

    const first = await request(app).post('/api/v1/company/onboarding/register').send(payload);
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/v1/company/onboarding/register').send({
      ...payload,
      legalName: 'Another Kitchen',
      primaryEmail: `other-${suffix}@example.com`,
    });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
  });
});

describe('Company addresses', () => {
  let companyId: string;
  let companyUserId: string;

  beforeAll(async () => {
    const suffix = Date.now();
    const res = await request(app)
      .post('/api/v1/company/onboarding/register')
      .send({
        legalName: `Address Kitchen ${suffix}`,
        countryCode: 'SA',
        primaryContactName: 'Omar',
        primaryEmail: `addr-company-${suffix}@example.com`,
        primaryPhone: '+966500000003',
        userFullName: 'Omar',
        userEmail: `addr-user-${suffix}@example.com`,
        password: 'SecurePass123!',
      });

    companyId = res.body.data.companyId;
    companyUserId = res.body.data.companyUserId;
  });

  function authHeaders() {
    return {
      'x-test-company-id': companyId,
      'x-test-company-user-id': companyUserId,
    };
  }

  it('requires company auth', async () => {
    const res = await request(app).get('/api/v1/company/onboarding/addresses');
    expect(res.status).toBe(401);
  });

  it('creates and lists addresses', async () => {
    const create = await request(app)
      .post('/api/v1/company/onboarding/addresses')
      .set(authHeaders())
      .send({
        addressType: 'billing',
        addressLine1: 'King Fahd Road',
        city: 'Riyadh',
        countryCode: 'SA',
        isDefault: true,
      });

    expect(create.status).toBe(201);
    expect(create.body.data.addressType).toBe('billing');
    expect(create.body.data.isDefault).toBe(true);

    const list = await request(app)
      .get('/api/v1/company/onboarding/addresses')
      .set(authHeaders());

    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('returns 409 for duplicate default address type', async () => {
    const res = await request(app)
      .post('/api/v1/company/onboarding/addresses')
      .set(authHeaders())
      .send({
        addressType: 'billing',
        addressLine1: 'Second billing',
        isDefault: true,
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('Company onboarding documents', () => {
  let companyId: string;
  let companyUserId: string;

  beforeAll(async () => {
    const suffix = Date.now();
    const res = await request(app)
      .post('/api/v1/company/onboarding/register')
      .send({
        legalName: `Docs Kitchen ${suffix}`,
        countryCode: 'SA',
        primaryContactName: 'Noura',
        primaryEmail: `docs-company-${suffix}@example.com`,
        primaryPhone: '+966500000005',
        userFullName: 'Noura',
        userEmail: `docs-user-${suffix}@example.com`,
        password: 'SecurePass123!',
      });

    companyId = res.body.data.companyId;
    companyUserId = res.body.data.companyUserId;
  });

  function authHeaders() {
    return {
      'x-test-company-id': companyId,
      'x-test-company-user-id': companyUserId,
    };
  }

  it('requires company auth to upload documents', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 test content');
    const res = await request(app)
      .post('/api/v1/company/onboarding/documents')
      .field('attachmentType', 'trade_license')
      .attach('file', pdfBuffer, {
        filename: 'license.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(401);
  });

  it('uploads an onboarding document for the caller company', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 onboarding doc');

    const res = await request(app)
      .post('/api/v1/company/onboarding/documents')
      .set(authHeaders())
      .field('attachmentType', 'commercial_registration')
      .field('caption', 'CR certificate')
      .attach('file', pdfBuffer, {
        filename: 'cr.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.attachments).toHaveLength(1);
    expect(res.body.data.attachments[0]).toMatchObject({
      entityType: 'company',
      entityId: companyId,
      attachmentType: 'commercial_registration',
    });
  });
});
