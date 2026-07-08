import { ApprovalStatus, CompanyStatus, Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../core/errors/AppError';
import type { RequestActor } from '../../core/middleware/requestContext';
import { getDashboardCompanyScopeFilter } from '../../engines/companyScopeResolver';

export interface ListCompaniesQuery {
  approvalStatus?: ApprovalStatus;
  page?: number;
  pageSize?: number;
  dashboardUserId?: string;
}

function serializeCompanySummary(company: {
  id: string;
  legal_name: string;
  trade_name: string | null;
  primary_email: string;
  primary_phone: string;
  country_code: string;
  city: string | null;
  status: CompanyStatus;
  approval_status: ApprovalStatus;
  created_at: Date;
}) {
  return {
    id: company.id,
    legalName: company.legal_name,
    tradeName: company.trade_name,
    primaryEmail: company.primary_email,
    primaryPhone: company.primary_phone,
    countryCode: company.country_code,
    city: company.city,
    status: company.status,
    approvalStatus: company.approval_status,
    createdAt: company.created_at.toISOString(),
  };
}

export async function listCompanies(query: ListCompaniesQuery) {
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 20, 100);
  const skip = (page - 1) * pageSize;

  const scopeFilter = query.dashboardUserId
    ? await getDashboardCompanyScopeFilter(query.dashboardUserId)
    : undefined;

  const where: Prisma.CompanyWhereInput = {
    is_deleted: false,
    ...(query.approvalStatus ? { approval_status: query.approvalStatus } : {}),
    ...(scopeFilter ?? {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.company.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.company.count({ where }),
  ]);

  return {
    items: items.map(serializeCompanySummary),
    pagination: { page, pageSize, totalItems },
  };
}

export async function approveCompany(
  companyId: string,
  actor: RequestActor,
  reason?: string,
) {
  if (actor.type !== 'dashboard_user') {
    throw new BadRequestError('Dashboard authentication required');
  }

  const company = await prisma.company.findFirst({
    where: { id: companyId, is_deleted: false },
  });

  if (!company) {
    throw new NotFoundError('Company not found');
  }

  if (company.approval_status === ApprovalStatus.approved) {
    throw new ConflictError('Company is already approved');
  }

  const fromStatus = company.approval_status;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.company.update({
      where: { id: companyId },
      data: {
        approval_status: ApprovalStatus.approved,
        status: CompanyStatus.active,
        approval_notes: reason ?? null,
        approved_by: actor.id,
        approved_at: new Date(),
      },
    });

    await tx.companyApprovalHistory.create({
      data: {
        company_id: companyId,
        from_status: fromStatus,
        to_status: ApprovalStatus.approved,
        actor_id: actor.id,
        reason: reason ?? null,
      },
    });

    return result;
  });

  return serializeCompanySummary(updated);
}

export async function rejectCompany(
  companyId: string,
  actor: RequestActor,
  reason?: string,
) {
  if (actor.type !== 'dashboard_user') {
    throw new BadRequestError('Dashboard authentication required');
  }

  const company = await prisma.company.findFirst({
    where: { id: companyId, is_deleted: false },
  });

  if (!company) {
    throw new NotFoundError('Company not found');
  }

  if (company.approval_status === ApprovalStatus.rejected) {
    throw new ConflictError('Company is already rejected');
  }

  const fromStatus = company.approval_status;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.company.update({
      where: { id: companyId },
      data: {
        approval_status: ApprovalStatus.rejected,
        approval_notes: reason ?? null,
      },
    });

    await tx.companyApprovalHistory.create({
      data: {
        company_id: companyId,
        from_status: fromStatus,
        to_status: ApprovalStatus.rejected,
        actor_id: actor.id,
        reason: reason ?? null,
      },
    });

    return result;
  });

  return serializeCompanySummary(updated);
}

export async function getCompany(companyId: string, dashboardUserId?: string) {
  const scopeFilter = dashboardUserId
    ? await getDashboardCompanyScopeFilter(dashboardUserId)
    : undefined;

  const company = await prisma.company.findFirst({
    where: {
      id: companyId,
      is_deleted: false,
      ...(scopeFilter ?? {}),
    },
  });

  if (!company) {
    throw new NotFoundError('Company not found');
  }

  return serializeCompanySummary(company);
}

export async function listCompanyDocuments(companyId: string) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, is_deleted: false },
  });
  if (!company) {
    throw new NotFoundError('Company not found');
  }

  const attachments = await prisma.fileAttachment.findMany({
    where: { entity_type: 'company', entity_id: companyId },
    include: { file: true },
    orderBy: { created_at: 'desc' },
  });

  return attachments.map((a) => ({
    id: a.id,
    companyId,
    attachmentType: a.attachment_type,
    verificationStatus: a.verification_status,
    verifiedBy: a.verified_by,
    verifiedAt: a.verified_at?.toISOString() ?? null,
    file: {
      id: a.file.id,
      fileName: a.file.file_name,
      mimeType: a.file.mime_type,
      url: a.file.url,
    },
  }));
}
