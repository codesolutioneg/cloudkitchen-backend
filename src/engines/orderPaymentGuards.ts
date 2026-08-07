import { prisma } from '../prisma/client';
import { BadRequestError } from '../core/errors/AppError';

/** Kitchen / delivery ops require payment approval first. */
export const POST_PAYMENT_STEP_CODES = new Set([
  'kitchen_accepted',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'awaiting_pickup',
  'picked_up',
]);

export const PAYMENT_STEP_CODES = new Set([
  'awaiting_payment_proof',
  'payment_pending_review',
  'payment_approved',
]);

export async function assertOrderPaymentApprovedForOps(orderId: string) {
  const payment = await prisma.orderPayment.findUnique({ where: { order_id: orderId } });
  if (!payment || payment.status !== 'approved') {
    throw new BadRequestError('Payment proof must be approved before kitchen or delivery operations');
  }
}

export async function assertCanCancelOrder(orderId: string) {
  const payment = await prisma.orderPayment.findUnique({ where: { order_id: orderId } });
  if (payment?.status === 'approved') {
    throw new BadRequestError('Cannot cancel an order after payment has been approved');
  }
}

export async function assertDashboardTransitionAllowed(
  orderId: string,
  targetStepCode: string,
) {
  if (!POST_PAYMENT_STEP_CODES.has(targetStepCode)) return;
  await assertOrderPaymentApprovedForOps(orderId);
}

export function calendarColor(
  stepCode: string | null | undefined,
  paymentStatus: string | null | undefined,
): string {
  if (stepCode === 'cancelled') return 'red';
  if (paymentStatus === 'approved') return 'green';
  if (paymentStatus === 'pending_review') return 'yellow';
  if (paymentStatus === 'rejected') return 'orange';
  return 'gray';
}
