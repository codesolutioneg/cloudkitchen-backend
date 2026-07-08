import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';

describe('Files module', () => {
  let companyId: string;
  let companyUserId: string;

  beforeAll(async () => {
    const suffix = Date.now();
    const res = await request(app)
      .post('/api/v1/company/onboarding/register')
      .send({
        legalName: `Files Kitchen ${suffix}`,
        countryCode: 'SA',
        primaryContactName: 'Layla',
        primaryEmail: `files-company-${suffix}@example.com`,
        primaryPhone: '+966500000004',
        userFullName: 'Layla',
        userEmail: `files-user-${suffix}@example.com`,
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

  it('uploads, downloads, and deletes a file attachment', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 test content');

    const upload = await request(app)
      .post('/api/v1/files')
      .set(authHeaders())
      .field('entityType', 'company')
      .field('entityId', companyId)
      .field('attachmentType', 'trade_license')
      .attach('file', pdfBuffer, {
        filename: 'license.pdf',
        contentType: 'application/pdf',
      });

    expect(upload.status).toBe(201);
    expect(upload.body.data.attachments).toHaveLength(1);

    const fileId = upload.body.data.id as string;
    const attachmentId = upload.body.data.attachments[0].id as string;

    const download = await request(app)
      .get(`/api/v1/files/${fileId}`)
      .set(authHeaders());

    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('pdf');

    const del = await request(app)
      .delete(`/api/v1/files/attachments/${attachmentId}`)
      .set(authHeaders());

    expect(del.status).toBe(204);
  });
});
