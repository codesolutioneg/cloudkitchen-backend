import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../core/errors/AppError';
import { getRequestActor } from '../../core/middleware/requestContext';
import { workflowEngine } from '../../engines/workflowEngine';
import { timelineService } from '../../engines/timelineService';
import { generateOrderReceipt } from '../receipts/receipt.service';

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

async function getOrderWithWorkflow(orderId: string, companyId?: string) {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      is_deleted: false,
      ...(companyId ? { company_id: companyId } : {}),
    },
    include: {
      workflow_instance: { include: { current_step: true, workflow: true } },
      payment: true,
    },
  });
  if (!order) throw new NotFoundError('Order not found');
  return order;
}

async function findStep(workflowId: string, code: string) {
  return prisma.workflowStep.findFirst({
    where: { workflow_id: workflowId, code },
  });
}

export async function submitPaymentProof(orderId: string, proofAttachmentId: string) {
  const actor = getCompanyActorOrThrow();
  const order = await getOrderWithWorkflow(orderId, actor.companyId);

  if (!order.workflow_instance) {
    throw new BadRequestError('Order has no workflow');
  }

  const currentCode = order.workflow_instance.current_step.code;
  if (!['awaiting_payment_proof', 'payment_pending_review'].includes(currentCode) && order.payment?.status !== 'rejected') {
    throw new BadRequestError('Payment proof cannot be submitted at this stage');
  }

  const reviewStep = await findStep(order.workflow_instance.workflow_id, 'payment_pending_review');
  if (!reviewStep) {
    throw new BadRequestError('Payment review step is not configured');
  }

  await prisma.$transaction(async (tx) => {
    await tx.orderPayment.upsert({
      where: { order_id: orderId },
      create: {
        order_id: orderId,
        status: 'pending_review',
        proof_attachment_id: proofAttachmentId,
      },
      update: {
        status: 'pending_review',
        proof_attachment_id: proofAttachmentId,
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
      },
    });

    if (currentCode === 'awaiting_payment_proof' || currentCode === 'payment_pending_review') {
      await workflowEngine.transition({
        instanceId: order.workflow_instance_id!,
        toStepId: reviewStep.id,
        triggerType: 'manual',
        comment: 'Payment proof uploaded',
      });
    }

    await tx.orderStatusHistory.create({
      data: {
        order_id: orderId,
        status_code: 'payment_pending_review',
        changed_by: actor.id,
        comment: 'Payment screenshot submitted',
      },
    });
  });

  await timelineService.recordTimelineEvent({
    entityType: 'order',
    entityId: orderId,
    eventCode: 'order.payment.submitted',
    actorType: actor.type,
    actorId: actor.id,
  });

  return prisma.orderPayment.findUnique({ where: { order_id: orderId } });
}

export async function approvePayment(orderId: string, comment?: string) {
  const actor = getDashboardActorOrThrow();
  const order = await getOrderWithWorkflow(orderId);

  const payment = order.payment;
  if (!payment || payment.status !== 'pending_review') {
    throw new BadRequestError('No payment pending review for this order');
  }

  const approvedStep = await findStep(order.workflow_instance!.workflow_id, 'payment_approved');
  const kitchenStep = await findStep(order.workflow_instance!.workflow_id, 'kitchen_accepted');
  if (!approvedStep || !kitchenStep) {
    throw new BadRequestError('Payment approval workflow steps are not configured');
  }

  await prisma.$transaction(async (tx) => {
    await tx.orderPayment.update({
      where: { order_id: orderId },
      data: {
        status: 'approved',
        reviewed_by: actor.id,
        reviewed_at: new Date(),
        rejection_reason: null,
      },
    });

    await workflowEngine.transition({
      instanceId: order.workflow_instance_id!,
      toStepId: approvedStep.id,
      triggerType: 'manual',
      comment: comment ?? 'Payment approved',
    });

    await workflowEngine.transition({
      instanceId: order.workflow_instance_id!,
      toStepId: kitchenStep.id,
      triggerType: 'manual',
      comment: 'Released to kitchen after payment approval',
    });

    await tx.orderStatusHistory.create({
      data: {
        order_id: orderId,
        status_code: 'payment_approved',
        changed_by: actor.id,
        comment: comment ?? 'Payment approved',
      },
    });
  });

  const receiptFileId = await generateOrderReceipt(orderId);
  if (receiptFileId) {
    await prisma.orderPayment.update({
      where: { order_id: orderId },
      data: { receipt_file_id: receiptFileId },
    });
  }

  await timelineService.recordTimelineEvent({
    entityType: 'order',
    entityId: orderId,
    eventCode: 'order.payment.approved',
    actorType: actor.type,
    actorId: actor.id,
    comment,
  });

  return prisma.orderPayment.findUnique({ where: { order_id: orderId } });
}

export async function rejectPayment(orderId: string, reason?: string) {
  const actor = getDashboardActorOrThrow();
  const order = await getOrderWithWorkflow(orderId);

  const payment = order.payment;
  if (!payment || payment.status !== 'pending_review') {
    throw new BadRequestError('No payment pending review for this order');
  }

  const awaitingStep = await findStep(order.workflow_instance!.workflow_id, 'awaiting_payment_proof');
  if (!awaitingStep) {
    throw new BadRequestError('Awaiting payment step is not configured');
  }

  await prisma.$transaction(async (tx) => {
    await tx.orderPayment.update({
      where: { order_id: orderId },
      data: {
        status: 'rejected',
        reviewed_by: actor.id,
        reviewed_at: new Date(),
        rejection_reason: reason ?? null,
      },
    });

    await workflowEngine.transition({
      instanceId: order.workflow_instance_id!,
      toStepId: awaitingStep.id,
      triggerType: 'manual',
      comment: reason ?? 'Payment rejected — re-upload required',
    });

    await tx.orderStatusHistory.create({
      data: {
        order_id: orderId,
        status_code: 'awaiting_payment_proof',
        changed_by: actor.id,
        comment: reason ?? 'Payment rejected',
      },
    });
  });

  await timelineService.recordTimelineEvent({
    entityType: 'order',
    entityId: orderId,
    eventCode: 'order.payment.rejected',
    actorType: actor.type,
    actorId: actor.id,
    comment: reason,
  });

  return prisma.orderPayment.findUnique({ where: { order_id: orderId } });
}

export async function getOrderPayment(orderId: string) {
  const actor = getRequestActor();
  if (!actor) throw new ForbiddenError('Authentication required');

  const where: Prisma.OrderWhereInput = { id: orderId, is_deleted: false };
  if (actor.type === 'company_user' && actor.companyId) {
    where.company_id = actor.companyId;
  }

  const order = await prisma.order.findFirst({ where, select: { id: true } });
  if (!order) throw new NotFoundError('Order not found');

  return prisma.orderPayment.findUnique({ where: { order_id: orderId } });
}
