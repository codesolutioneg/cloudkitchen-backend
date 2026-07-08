import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { getTestDashboardUserId } from '../helpers/dashboardUser';

describe('Dashboard company review', () => {
  let dashboardUserId: string;
  let pendingCompanyId: string;
  let rejectCompanyId: string;
  let documentCompanyId: string;
  let documentCompanyUserId: string;
  let attachmentId: string;

  beforeAll(async () => {
    dashboardUserId = await getTestDashboardUserId();

    const suffix = Date.now();

    const pending = await request(app)
      .post('/api/v1/company/onboarding/register')
      .send({
        legalName: `Pending Kitchen ${suffix}`,
        countryCode: 'SA',
        primaryContactName: 'Faisal',
        primaryEmail: `pending-company-${suffix}@example.com`,
        primaryPhone: '+966500000006',
        userFullName: 'Faisal',
        userEmail: `pending-user-${suffix}@example.com`,
        password: 'SecurePass123!',
      });
    pendingCompanyId = pending.body.data.companyId;

    const reject = await request(app)
      .post('/api/v1/company/onboarding/register')
      .send({
        legalName: `Reject Kitchen ${suffix}`,
        countryCode: 'SA',
        primaryContactName: 'Huda',
        primaryEmail: `reject-company-${suffix}@example.com`,
        primaryPhone: '+966500000007',
        userFullName: 'Huda',
        userEmail: `reject-user-${suffix}@example.com`,
        password: 'SecurePass123!',
      });
    rejectCompanyId = reject.body.data.companyId;

    const docs = await request(app)
      .post('/api/v1/company/onboarding/register')
      .send({
        legalName: `Verify Docs Kitchen ${suffix}`,
        countryCode: 'SA',
        primaryContactName: 'Maha',
        primaryEmail: `verify-company-${suffix}@example.com`,
        primaryPhone: '+966500000008',
        userFullName: 'Maha',
        userEmail: `verify-user-${suffix}@example.com`,
        password: 'SecurePass123!',
      });
    documentCompanyId = docs.body.data.companyId;
    documentCompanyUserId = docs.body.data.companyUserId;

    const pdfBuffer = Buffer.from('%PDF-1.4 verify doc');
    const upload = await request(app)
      .post('/api/v1/company/onboarding/documents')
      .set({
        'x-test-company-id': documentCompanyId,
        'x-test-company-user-id': documentCompanyUserId,
      })
      .field('attachmentType', 'trade_license')
      .attach('file', pdfBuffer, {
        filename: 'license.pdf',
        contentType: 'application/pdf',
      });

    attachmentId = upload.body.data.attachments[0].id as string;
  });

  function dashboardHeaders() {
    return { 'x-test-dashboard-user-id': dashboardUserId };
  }

  it('requires dashboard auth', async () => {
    const res = await request(app).get('/api/v1/dashboard/companies');
    expect(res.status).toBe(401);
  });

  it('lists companies filtered by approval status', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/companies')
      .query({ approvalStatus: 'pending' })
      .set(dashboardHeaders());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.pagination).toMatchObject({
      page: expect.any(Number),
      pageSize: expect.any(Number),
      totalItems: expect.any(Number),
    });
    expect(res.body.data.some((c: { id: string }) => c.id === pendingCompanyId)).toBe(true);
  });

  it('approves a pending company', async () => {
    const res = await request(app)
      .post(`/api/v1/dashboard/companies/${pendingCompanyId}/approve`)
      .set(dashboardHeaders())
      .send({ reason: 'All documents look good' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: pendingCompanyId,
      approvalStatus: 'approved',
      status: 'active',
    });
  });

  it('rejects a pending company', async () => {
    const res = await request(app)
      .post(`/api/v1/dashboard/companies/${rejectCompanyId}/reject`)
      .set(dashboardHeaders())
      .send({ reason: 'Incomplete documentation' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: rejectCompanyId,
      approvalStatus: 'rejected',
    });
  });

  it('verifies a company onboarding document', async () => {
    const res = await request(app)
      .patch(
        `/api/v1/dashboard/companies/${documentCompanyId}/documents/${attachmentId}/verify`,
      )
      .set(dashboardHeaders())
      .send({ verificationStatus: 'verified' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: attachmentId,
      companyId: documentCompanyId,
      verificationStatus: 'verified',
      verifiedBy: dashboardUserId,
      verifiedAt: expect.any(String),
    });
  });
});
