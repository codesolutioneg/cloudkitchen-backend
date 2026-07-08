import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { config } from '../../config';
import { ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/AppError';
import { isPrismaUniqueViolation } from '../../core/utils/prismaErrors';
import { getRequestActor } from '../../core/middleware/requestContext';
import type { RequestActor } from '../../core/middleware/requestContext';
import * as filesService from '../files/files.service';
import { attachmentTypeSchema } from '../files/files.schemas';
import { z } from 'zod';

export type OnboardingAttachmentType = z.infer<typeof attachmentTypeSchema>;

export interface RegisterCompanyInput {
  legalName: string;
  tradeName?: string;
  commercialRegistrationNo?: string;
  taxRegistrationNo?: string;
  nationalAddressNo?: string;
  industrySector?: string;
  companySize?: string;
  countryCode: string;
  city?: string;
  primaryContactName: string;
  primaryContactTitle?: string;
  primaryEmail: string;
  primaryPhone: string;
  secondaryPhone?: string;
  website?: string;
  defaultCurrency?: string;
  defaultTimezone?: string;
  defaultLanguageCode?: string;
  userFullName: string;
  userEmail: string;
  userMobile?: string;
  password: string;
}

export async function registerCompany(input: RegisterCompanyInput) {
  const email = input.userEmail.toLowerCase().trim();
  const primaryEmail = input.primaryEmail.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(input.password, 12);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          legal_name: input.legalName,
          trade_name: input.tradeName ?? null,
          commercial_registration_no: input.commercialRegistrationNo ?? null,
          tax_registration_no: input.taxRegistrationNo ?? null,
          national_address_no: input.nationalAddressNo ?? null,
          industry_sector: input.industrySector ?? null,
          company_size: input.companySize ?? null,
          country_code: input.countryCode,
          city: input.city ?? null,
          primary_contact_name: input.primaryContactName,
          primary_contact_title: input.primaryContactTitle ?? null,
          primary_email: primaryEmail,
          primary_phone: input.primaryPhone,
          secondary_phone: input.secondaryPhone ?? null,
          website: input.website ?? null,
          default_currency: input.defaultCurrency ?? config.BUSINESS_DEFAULT_CURRENCY,
          default_timezone: input.defaultTimezone ?? config.BUSINESS_DEFAULT_TIMEZONE,
          default_language_code: input.defaultLanguageCode ?? config.BUSINESS_DEFAULT_LANGUAGE,
          status: 'pending',
          approval_status: 'pending',
          onboarding_source: 'self_signup',
        },
      });

      const user = await tx.companyUser.create({
        data: {
          company_id: company.id,
          full_name: input.userFullName,
          email,
          mobile: input.userMobile ?? null,
          password_hash: passwordHash,
          status: 'invited',
          is_primary_contact: true,
        },
      });

      return { company, user };
    });

    return {
      companyId: result.company.id,
      companyUserId: result.user.id,
      legalName: result.company.legal_name,
      approvalStatus: result.company.approval_status,
      userEmail: result.user.email,
    };
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      throw new ConflictError('A company or user with these details already exists');
    }
    throw error;
  }
}

export interface AddressInput {
  addressType: 'billing' | 'delivery';
  label?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateProvince?: string;
  countryCode?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  contactName?: string;
  contactPhone?: string;
  isDefault?: boolean;
}

function getCompanyActorOrThrow() {
  const actor = getRequestActor();
  if (actor?.type !== 'company_user' || !actor.companyId) {
    throw new ForbiddenError('Company authentication required');
  }
  return { ...actor, companyId: actor.companyId };
}

export async function listAddresses() {
  const actor = getCompanyActorOrThrow();

  const addresses = await prisma.companyAddress.findMany({
    where: { company_id: actor.companyId },
    orderBy: [{ address_type: 'asc' }, { created_at: 'asc' }],
  });

  return addresses.map(serializeAddress);
}

export async function createAddress(input: AddressInput) {
  const actor = getCompanyActorOrThrow();

  try {
    const address = await prisma.companyAddress.create({
      data: {
        company_id: actor.companyId,
        address_type: input.addressType,
        label: input.label ?? null,
        address_line1: input.addressLine1 ?? null,
        address_line2: input.addressLine2 ?? null,
        city: input.city ?? null,
        state_province: input.stateProvince ?? null,
        country_code: input.countryCode ?? null,
        postal_code: input.postalCode ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        contact_name: input.contactName ?? null,
        contact_phone: input.contactPhone ?? null,
        is_default: input.isDefault ?? false,
      },
    });

    return serializeAddress(address);
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      throw new ConflictError(
        'A default address already exists for this address type',
      );
    }
    throw error;
  }
}

export async function updateAddress(addressId: string, input: Partial<AddressInput>) {
  const actor = getCompanyActorOrThrow();

  const existing = await prisma.companyAddress.findFirst({
    where: { id: addressId, company_id: actor.companyId },
  });

  if (!existing) {
    throw new NotFoundError('Address not found');
  }

  try {
    const address = await prisma.companyAddress.update({
      where: { id: addressId, version: existing.version },
      data: {
        ...(input.addressType !== undefined ? { address_type: input.addressType } : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.addressLine1 !== undefined ? { address_line1: input.addressLine1 } : {}),
        ...(input.addressLine2 !== undefined ? { address_line2: input.addressLine2 } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.stateProvince !== undefined ? { state_province: input.stateProvince } : {}),
        ...(input.countryCode !== undefined ? { country_code: input.countryCode } : {}),
        ...(input.postalCode !== undefined ? { postal_code: input.postalCode } : {}),
        ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
        ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
        ...(input.contactName !== undefined ? { contact_name: input.contactName } : {}),
        ...(input.contactPhone !== undefined ? { contact_phone: input.contactPhone } : {}),
        ...(input.isDefault !== undefined ? { is_default: input.isDefault } : {}),
        version: { increment: 1 },
      },
    });

    return serializeAddress(address);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new ConflictError('Address was modified by someone else — reload and retry.');
    }
    if (isPrismaUniqueViolation(error)) {
      throw new ConflictError(
        'A default address already exists for this address type',
      );
    }
    throw error;
  }
}

export async function deleteAddress(addressId: string) {
  const actor = getCompanyActorOrThrow();

  const existing = await prisma.companyAddress.findFirst({
    where: { id: addressId, company_id: actor.companyId },
  });

  if (!existing) {
    throw new NotFoundError('Address not found');
  }

  await prisma.companyAddress.update({
    where: { id: addressId },
    data: {
      is_deleted: true,
      deleted_at: new Date(),
    },
  });
}

export interface UploadOnboardingDocumentInput {
  buffer: Buffer;
  fileName: string;
  declaredMimeType: string;
  attachmentType: OnboardingAttachmentType;
  caption?: string;
}

export async function uploadOnboardingDocument(
  input: UploadOnboardingDocumentInput,
  actor: RequestActor,
) {
  if (actor.type !== 'company_user' || !actor.companyId) {
    throw new ForbiddenError('Company authentication required');
  }

  return filesService.uploadFile(
    {
      buffer: input.buffer,
      fileName: input.fileName,
      declaredMimeType: input.declaredMimeType,
      entityType: 'company',
      entityId: actor.companyId,
      attachmentType: input.attachmentType,
      caption: input.caption,
    },
    actor,
  );
}

export async function verifyCompanyDocument(
  companyId: string,
  attachmentId: string,
  verificationStatus: 'verified' | 'rejected',
  actor: RequestActor,
) {
  if (actor.type !== 'dashboard_user') {
    throw new ForbiddenError('Dashboard authentication required');
  }

  const attachment = await prisma.fileAttachment.findFirst({
    where: {
      id: attachmentId,
      entity_type: 'company',
      entity_id: companyId,
    },
    include: { file: true },
  });

  if (!attachment) {
    throw new NotFoundError('Document not found for this company');
  }

  const updated = await prisma.fileAttachment.update({
    where: { id: attachmentId },
    data: {
      verification_status: verificationStatus,
      verified_by: actor.id,
      verified_at: new Date(),
    },
    include: { file: true },
  });

  return {
    id: updated.id,
    companyId,
    attachmentType: updated.attachment_type,
    verificationStatus: updated.verification_status,
    verifiedBy: updated.verified_by,
    verifiedAt: updated.verified_at?.toISOString() ?? null,
    file: {
      id: updated.file.id,
      fileName: updated.file.file_name,
      mimeType: updated.file.mime_type,
      url: updated.file.url,
    },
  };
}

function serializeAddress(address: {
  id: string;
  company_id: string;
  address_type: string;
  label: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_province: string | null;
  country_code: string | null;
  postal_code: string | null;
  latitude: { toString(): string } | null;
  longitude: { toString(): string } | null;
  contact_name: string | null;
  contact_phone: string | null;
  is_default: boolean;
  version: number;
}) {
  return {
    id: address.id,
    companyId: address.company_id,
    addressType: address.address_type,
    label: address.label,
    addressLine1: address.address_line1,
    addressLine2: address.address_line2,
    city: address.city,
    stateProvince: address.state_province,
    countryCode: address.country_code,
    postalCode: address.postal_code,
    latitude: address.latitude ? Number(address.latitude) : null,
    longitude: address.longitude ? Number(address.longitude) : null,
    contactName: address.contact_name,
    contactPhone: address.contact_phone,
    isDefault: address.is_default,
    version: address.version,
  };
}
