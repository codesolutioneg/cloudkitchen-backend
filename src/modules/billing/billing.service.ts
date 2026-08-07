import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../prisma/client';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../core/errors/AppError';
import { getRequestActor } from '../../core/middleware/requestContext';

/** The prisma client is extended, so the transaction client type is derived from it. */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Billing terms, consolidated invoices and instalment plans (§32).
 *
 * Per-order payment proof still works untouched for clients who pay as they go.
 * This module is for the ones on terms: a weekly or monthly invoice covering
 * many orders, or a meal plan split into instalments.
 */

export const PAYMENT_MODES = [
  'per_order',
  'weekly_invoice',
  'monthly_invoice',
  'plan_instalments',
] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

const OPEN_INVOICE_STATUSES = ['issued', 'part_paid', 'overdue'];

function getCompanyActorOrThrow() {
  const actor = getRequestActor();
  if (actor?.type !== 'company_user' || !actor.companyId) {
    throw new ForbiddenError('Company authentication required');
  }
  return { ...actor, companyId: actor.companyId };
}

function getDashboardActorOrThrow() {
  const actor = getRequestActor();
  if (actor?.type !== 'dashboard_user') {
    throw new ForbiddenError('Dashboard authentication required');
  }
  return actor;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

// ── Serialization ─────────────────────────────────────────────────────────────

type TermsRow = Prisma.CompanyBillingTermsGetPayload<object>;

function serializeTerms(terms: TermsRow) {
  return {
    companyId: terms.company_id,
    paymentMode: terms.payment_mode,
    netDays: terms.net_days,
    creditLimit: terms.credit_limit.toString(),
    currency: terms.currency,
    poReference: terms.po_reference,
    notes: terms.notes,
    updatedAt: terms.updated_at.toISOString(),
  };
}

type InvoiceRow = Prisma.InvoiceGetPayload<{
  include: { lines: true; instalments: true; company: { select: { legal_name: true } } };
}>;

function serializeInvoice(invoice: InvoiceRow) {
  const total = Number(invoice.total_amount);
  const paid = Number(invoice.paid_amount);
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    companyId: invoice.company_id,
    companyName: invoice.company?.legal_name ?? null,
    mealPlanId: invoice.meal_plan_id,
    status: invoice.status,
    source: invoice.source,
    periodStart: invoice.period_start ? isoDate(invoice.period_start) : null,
    periodEnd: invoice.period_end ? isoDate(invoice.period_end) : null,
    issuedAt: invoice.issued_at?.toISOString() ?? null,
    dueAt: invoice.due_at ? isoDate(invoice.due_at) : null,
    subtotalAmount: invoice.subtotal_amount.toString(),
    taxAmount: invoice.tax_amount.toString(),
    totalAmount: invoice.total_amount.toString(),
    paidAmount: invoice.paid_amount.toString(),
    outstandingAmount: (total - paid).toFixed(2),
    currency: invoice.currency,
    poReference: invoice.po_reference,
    notes: invoice.notes,
    createdAt: invoice.created_at.toISOString(),
    lines: invoice.lines.map((line) => ({
      id: line.id,
      orderId: line.order_id,
      description: line.description,
      quantity: line.quantity,
      unitAmount: line.unit_amount.toString(),
      lineTotal: line.line_total.toString(),
    })),
    instalments: [...invoice.instalments]
      .sort((a, b) => a.sequence - b.sequence)
      .map((i) => ({
        id: i.id,
        sequence: i.sequence,
        dueAt: isoDate(i.due_at),
        amount: i.amount.toString(),
        status: i.status,
        paidAt: i.paid_at?.toISOString() ?? null,
        rejectionReason: i.rejection_reason,
      })),
  };
}

const INVOICE_INCLUDE = {
  lines: true,
  instalments: true,
  company: { select: { legal_name: true } },
} as const;

// ── Billing terms ─────────────────────────────────────────────────────────────

/** Terms always exist conceptually; an unconfigured company is simply pay per order. */
export async function getCompanyTerms(companyId: string) {
  const terms = await prisma.companyBillingTerms.findUnique({ where: { company_id: companyId } });
  if (terms) return serializeTerms(terms);

  const company = await prisma.company.findFirst({
    where: { id: companyId, is_deleted: false },
    select: { id: true },
  });
  if (!company) {
    throw new NotFoundError('Company not found');
  }
  return {
    companyId,
    paymentMode: 'per_order',
    netDays: 0,
    creditLimit: '0.00',
    currency: 'EGP',
    poReference: null,
    notes: null,
    updatedAt: null,
  };
}

export async function getMyTerms() {
  const actor = getCompanyActorOrThrow();
  return getCompanyTerms(actor.companyId);
}

export async function setCompanyTerms(
  companyId: string,
  input: {
    paymentMode: PaymentMode;
    netDays?: number;
    creditLimit?: string;
    currency?: string;
    poReference?: string | null;
    notes?: string | null;
  },
) {
  const actor = getDashboardActorOrThrow();
  const company = await prisma.company.findFirst({
    where: { id: companyId, is_deleted: false },
    select: { id: true },
  });
  if (!company) {
    throw new NotFoundError('Company not found');
  }

  const values = {
    payment_mode: input.paymentMode,
    net_days: input.netDays ?? 0,
    credit_limit: new Decimal(input.creditLimit ?? '0'),
    currency: (input.currency ?? 'EGP').toUpperCase(),
    po_reference: input.poReference ?? null,
    notes: input.notes ?? null,
    updated_by_type: actor.type,
    updated_by_id: actor.id,
  };

  const terms = await prisma.companyBillingTerms.upsert({
    where: { company_id: companyId },
    create: { company_id: companyId, ...values },
    update: values,
  });
  return serializeTerms(terms);
}

// ── Invoice numbering ─────────────────────────────────────────────────────────

/**
 * Sequential per year, e.g. INV-2026-000042.
 *
 * Derived from the highest existing number for the year rather than a counter
 * table, and only ever called inside the invoice-creating transaction so two
 * concurrent runs cannot land on the same number.
 */
async function nextInvoiceNumber(tx: Tx, year: number): Promise<string> {
  const prefix = `INV-${year}-`;
  const last = await tx.invoice.findFirst({
    where: { invoice_number: { startsWith: prefix } },
    orderBy: { invoice_number: 'desc' },
    select: { invoice_number: true },
  });
  const lastSeq = last ? Number(last.invoice_number.slice(prefix.length)) : 0;
  return `${prefix}${String(lastSeq + 1).padStart(6, '0')}`;
}

// ── Invoices from orders ──────────────────────────────────────────────────────

/**
 * Consolidates every uninvoiced order delivered in a period into one invoice.
 *
 * @param companyId Company being billed.
 * @param input Period covered, and whether to issue immediately.
 * @returns The created invoice, or null when the period has nothing to bill.
 */
export async function generateInvoiceForPeriod(
  companyId: string,
  input: { periodStart: string; periodEnd: string; issue?: boolean; notes?: string },
) {
  const actor = getDashboardActorOrThrow();
  const terms = await getCompanyTerms(companyId);

  const from = new Date(`${input.periodStart}T00:00:00.000Z`);
  const to = new Date(`${input.periodEnd}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    throw new BadRequestError('periodEnd must be on or after periodStart');
  }

  // An order belongs on exactly one invoice, so anything already billed is skipped.
  const orders = await prisma.order.findMany({
    where: {
      company_id: companyId,
      is_deleted: false,
      requested_delivery_at: { gte: from, lte: to },
      invoice_lines: { none: {} },
      workflow_instance: { current_step: { code: { notIn: ['cancelled', 'refunded'] } } },
    },
    select: {
      id: true,
      order_number: true,
      requested_delivery_at: true,
      subtotal_amount: true,
      tax_amount: true,
      total_amount: true,
      currency: true,
    },
    orderBy: { requested_delivery_at: 'asc' },
  });

  if (orders.length === 0) return null;

  const subtotal = orders.reduce((sum, o) => sum.plus(o.subtotal_amount), new Decimal(0));
  const tax = orders.reduce((sum, o) => sum.plus(o.tax_amount), new Decimal(0));
  const total = orders.reduce((sum, o) => sum.plus(o.total_amount), new Decimal(0));
  const issue = input.issue ?? true;
  const issuedAt = issue ? new Date() : null;
  const dueAt = issue
    ? new Date(Date.now() + (terms.netDays ?? 0) * 86_400_000)
    : null;

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        company_id: companyId,
        invoice_number: await nextInvoiceNumber(tx, from.getUTCFullYear()),
        status: issue ? 'issued' : 'draft',
        source: 'orders',
        period_start: from,
        period_end: new Date(`${input.periodEnd}T00:00:00.000Z`),
        issued_at: issuedAt,
        due_at: dueAt,
        subtotal_amount: subtotal,
        tax_amount: tax,
        total_amount: total,
        currency: orders[0]!.currency,
        po_reference: terms.poReference,
        notes: input.notes ?? null,
        created_by_type: actor.type,
        created_by_id: actor.id,
        lines: {
          create: orders.map((o) => ({
            order_id: o.id,
            description: `${o.order_number} ${isoDate(o.requested_delivery_at)}`,
            quantity: 1,
            unit_amount: o.total_amount,
            line_total: o.total_amount,
          })),
        },
      },
      include: INVOICE_INCLUDE,
    });
    return created;
  });

  return serializeInvoice(invoice);
}

/**
 * Splits a confirmed meal plan into equal instalments on one invoice.
 *
 * Rounding lands on the final instalment so the parts always sum to the total
 * exactly, rather than drifting by a piastre per row.
 */
export async function createPlanInstalments(
  planId: string,
  input: { count: number; firstDueDate: string; everyDays?: number; issue?: boolean },
) {
  const actor = getDashboardActorOrThrow();

  const plan = await prisma.mealPlan.findFirst({
    where: { id: planId, is_deleted: false },
    include: { company: { select: { legal_name: true } } },
  });
  if (!plan) {
    throw new NotFoundError('Meal plan not found');
  }
  if (plan.status !== 'approved') {
    throw new ConflictError('Only a confirmed plan can be put on instalments');
  }

  const existing = await prisma.invoice.count({
    where: { meal_plan_id: planId, is_deleted: false },
  });
  if (existing > 0) {
    throw new ConflictError('This plan already has an invoice');
  }

  const count = Math.trunc(input.count);
  if (count < 1 || count > 24) {
    throw new BadRequestError('Instalment count must be between 1 and 24');
  }

  const total = plan.total_cost;
  const per = total.dividedBy(count).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const everyDays = input.everyDays ?? 7;
  const firstDue = new Date(`${input.firstDueDate}T00:00:00.000Z`);
  if (Number.isNaN(firstDue.getTime())) {
    throw new BadRequestError('firstDueDate must be a valid date');
  }

  const amounts: Decimal[] = [];
  for (let i = 0; i < count; i += 1) amounts.push(per);
  // The remainder rides on the last instalment so the parts sum to the total.
  const drift = total.minus(per.times(count));
  amounts[count - 1] = amounts[count - 1]!.plus(drift);

  const issue = input.issue ?? true;

  const invoice = await prisma.$transaction(async (tx) => {
    return tx.invoice.create({
      data: {
        company_id: plan.company_id,
        meal_plan_id: plan.id,
        invoice_number: await nextInvoiceNumber(tx, firstDue.getUTCFullYear()),
        status: issue ? 'issued' : 'draft',
        source: 'plan_instalments',
        period_start: plan.start_date,
        period_end: plan.end_date,
        issued_at: issue ? new Date() : null,
        due_at: firstDue,
        subtotal_amount: total,
        tax_amount: new Decimal(0),
        total_amount: total,
        currency: plan.currency,
        created_by_type: actor.type,
        created_by_id: actor.id,
        lines: {
          create: [
            {
              description: `${plan.name} (${isoDate(plan.start_date)} to ${isoDate(plan.end_date)})`,
              quantity: 1,
              unit_amount: total,
              line_total: total,
            },
          ],
        },
        instalments: {
          create: amounts.map((amount, index) => ({
            sequence: index + 1,
            due_at: new Date(firstDue.getTime() + index * everyDays * 86_400_000),
            amount,
            status: 'pending',
          })),
        },
      },
      include: INVOICE_INCLUDE,
    });
  });

  return serializeInvoice(invoice);
}

// ── Reading invoices ──────────────────────────────────────────────────────────

export async function listInvoices(query: { companyId?: string; status?: string }) {
  getDashboardActorOrThrow();
  const invoices = await prisma.invoice.findMany({
    where: {
      is_deleted: false,
      ...(query.companyId ? { company_id: query.companyId } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    include: INVOICE_INCLUDE,
    orderBy: { created_at: 'desc' },
    take: 200,
  });
  return invoices.map(serializeInvoice);
}

export async function getInvoice(invoiceId: string) {
  getDashboardActorOrThrow();
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, is_deleted: false },
    include: INVOICE_INCLUDE,
  });
  if (!invoice) {
    throw new NotFoundError('Invoice not found');
  }
  return serializeInvoice(invoice);
}

export async function listMyInvoices() {
  const actor = getCompanyActorOrThrow();
  const invoices = await prisma.invoice.findMany({
    where: { company_id: actor.companyId, is_deleted: false, status: { not: 'draft' } },
    include: INVOICE_INCLUDE,
    orderBy: { created_at: 'desc' },
  });
  return invoices.map(serializeInvoice);
}

export async function getMyInvoice(invoiceId: string) {
  const actor = getCompanyActorOrThrow();
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      company_id: actor.companyId,
      is_deleted: false,
      status: { not: 'draft' },
    },
    include: INVOICE_INCLUDE,
  });
  if (!invoice) {
    throw new NotFoundError('Invoice not found');
  }
  return serializeInvoice(invoice);
}

/** What the client owes right now, and how much credit is left. */
export async function getMyBillingSummary() {
  const actor = getCompanyActorOrThrow();
  const terms = await getCompanyTerms(actor.companyId);

  const open = await prisma.invoice.findMany({
    where: {
      company_id: actor.companyId,
      is_deleted: false,
      status: { in: OPEN_INVOICE_STATUSES },
    },
    select: { total_amount: true, paid_amount: true, due_at: true },
  });

  const outstanding = open.reduce(
    (sum, i) => sum.plus(i.total_amount).minus(i.paid_amount),
    new Decimal(0),
  );
  const today = new Date();
  const overdue = open.reduce(
    (sum, i) =>
      i.due_at && i.due_at < today ? sum.plus(i.total_amount).minus(i.paid_amount) : sum,
    new Decimal(0),
  );

  const nextInstalment = await prisma.paymentInstalment.findFirst({
    where: {
      status: { in: ['pending', 'overdue'] },
      invoice: { company_id: actor.companyId, is_deleted: false },
    },
    orderBy: { due_at: 'asc' },
    include: { invoice: { select: { id: true, invoice_number: true, currency: true } } },
  });

  const creditLimit = new Decimal(terms.creditLimit);
  return {
    terms,
    openInvoiceCount: open.length,
    outstandingAmount: outstanding.toFixed(2),
    overdueAmount: overdue.toFixed(2),
    creditRemaining: creditLimit.isZero()
      ? null
      : creditLimit.minus(outstanding).toFixed(2),
    nextInstalment: nextInstalment
      ? {
          id: nextInstalment.id,
          invoiceId: nextInstalment.invoice.id,
          invoiceNumber: nextInstalment.invoice.invoice_number,
          sequence: nextInstalment.sequence,
          dueAt: isoDate(nextInstalment.due_at),
          amount: nextInstalment.amount.toString(),
          currency: nextInstalment.invoice.currency,
          status: nextInstalment.status,
        }
      : null,
  };
}

// ── Paying ────────────────────────────────────────────────────────────────────

/** Recomputes invoice paid total and status from its instalments. */
async function refreshInvoiceStatus(tx: Tx, invoiceId: string) {
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { instalments: true },
  });

  if (invoice.instalments.length === 0) return;

  const paid = invoice.instalments
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum.plus(i.amount), new Decimal(0));

  const status = paid.greaterThanOrEqualTo(invoice.total_amount)
    ? 'paid'
    : paid.greaterThan(0)
      ? 'part_paid'
      : invoice.due_at && invoice.due_at < new Date()
        ? 'overdue'
        : invoice.status === 'draft'
          ? 'draft'
          : 'issued';

  await tx.invoice.update({
    where: { id: invoiceId },
    data: { paid_amount: paid, status },
  });
}

/** Client attaches proof of a bank transfer against one instalment. */
export async function submitInstalmentProof(instalmentId: string, proofAttachmentId: string) {
  const actor = getCompanyActorOrThrow();
  const instalment = await prisma.paymentInstalment.findFirst({
    where: { id: instalmentId, invoice: { company_id: actor.companyId, is_deleted: false } },
  });
  if (!instalment) {
    throw new NotFoundError('Instalment not found');
  }
  if (instalment.status === 'paid') {
    throw new ConflictError('That instalment is already paid');
  }

  await prisma.paymentInstalment.update({
    where: { id: instalmentId },
    data: {
      proof_attachment_id: proofAttachmentId,
      status: 'proof_submitted',
      rejection_reason: null,
    },
  });

  return getMyInvoice(instalment.invoice_id);
}

/** Finance approves or rejects a submitted instalment payment. */
export async function decideInstalment(
  instalmentId: string,
  input: { decision: 'approved' | 'rejected'; reason?: string },
) {
  const actor = getDashboardActorOrThrow();
  const instalment = await prisma.paymentInstalment.findUnique({ where: { id: instalmentId } });
  if (!instalment) {
    throw new NotFoundError('Instalment not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentInstalment.update({
      where: { id: instalmentId },
      data:
        input.decision === 'approved'
          ? {
              status: 'paid',
              paid_at: new Date(),
              reviewed_by: actor.id,
              reviewed_at: new Date(),
              rejection_reason: null,
            }
          : {
              status: 'pending',
              reviewed_by: actor.id,
              reviewed_at: new Date(),
              rejection_reason: input.reason ?? 'Payment proof rejected',
            },
    });
    await refreshInvoiceStatus(tx, instalment.invoice_id);
  });

  return getInvoice(instalment.invoice_id);
}

/** Finance records a payment straight against an invoice with no instalments. */
export async function recordInvoicePayment(invoiceId: string, amount: string) {
  getDashboardActorOrThrow();
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, is_deleted: false },
  });
  if (!invoice) {
    throw new NotFoundError('Invoice not found');
  }

  const paid = invoice.paid_amount.plus(new Decimal(amount));
  if (paid.greaterThan(invoice.total_amount)) {
    throw new BadRequestError('That payment is more than the invoice outstanding balance');
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      paid_amount: paid,
      status: paid.greaterThanOrEqualTo(invoice.total_amount) ? 'paid' : 'part_paid',
    },
  });

  return getInvoice(invoiceId);
}

/**
 * Marks issued invoices and instalments past their due date as overdue.
 * Safe to run repeatedly; intended for the daily scheduler.
 */
export async function markOverdue() {
  const today = new Date();
  const [invoices, instalments] = await prisma.$transaction([
    prisma.invoice.updateMany({
      where: { is_deleted: false, status: { in: ['issued', 'part_paid'] }, due_at: { lt: today } },
      data: { status: 'overdue' },
    }),
    prisma.paymentInstalment.updateMany({
      where: { status: 'pending', due_at: { lt: today } },
      data: { status: 'overdue' },
    }),
  ]);
  return { invoicesMarked: invoices.count, instalmentsMarked: instalments.count };
}
