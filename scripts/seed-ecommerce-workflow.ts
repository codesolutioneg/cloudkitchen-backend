/**
 * Upsert ecommerce workflow steps, transitions, and min daily order rule type.
 * Run: npx tsx scripts/seed-ecommerce-workflow.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ORDER_WORKFLOW_ID = '00000000-0000-4000-8000-000000000001';

const PAYMENT_STEPS = [
  {
    id: '00000000-0000-4000-8000-000000000021',
    code: 'awaiting_payment_proof',
    name: 'Awaiting Payment Proof',
    stepType: 'initial' as const,
    sortOrder: 8,
  },
  {
    id: '00000000-0000-4000-8000-000000000022',
    code: 'payment_pending_review',
    name: 'Payment Pending Review',
    stepType: 'intermediate' as const,
    sortOrder: 18,
  },
  {
    id: '00000000-0000-4000-8000-000000000023',
    code: 'payment_approved',
    name: 'Payment Approved',
    stepType: 'intermediate' as const,
    sortOrder: 22,
  },
];

const EXTRA_TRANSITIONS: Array<{ from: string; to: string }> = [
  { from: 'awaiting_payment_proof', to: 'payment_pending_review' },
  { from: 'payment_pending_review', to: 'payment_approved' },
  { from: 'payment_pending_review', to: 'awaiting_payment_proof' },
  { from: 'payment_approved', to: 'kitchen_accepted' },
  { from: 'awaiting_payment_proof', to: 'cancelled' },
  { from: 'payment_pending_review', to: 'cancelled' },
  { from: 'submitted', to: 'awaiting_payment_proof' },
];

async function main() {
  await prisma.ruleType.upsert({
    where: { code: 'min_daily_order_amount' },
    update: {
      name: 'Minimum Daily Order Amount',
      value_schema: { type: 'object', properties: { amount: { type: 'number' }, currency: { type: 'string' } } },
    },
    create: {
      code: 'min_daily_order_amount',
      name: 'Minimum Daily Order Amount',
      value_schema: { type: 'object', properties: { amount: { type: 'number' }, currency: { type: 'string' } } },
    },
  });

  for (const step of PAYMENT_STEPS) {
    await prisma.workflowStep.upsert({
      where: { workflow_id_code: { workflow_id: ORDER_WORKFLOW_ID, code: step.code } },
      update: {
        name: step.name,
        step_type: step.stepType,
        sort_order: step.sortOrder,
      },
      create: {
        id: step.id,
        workflow_id: ORDER_WORKFLOW_ID,
        code: step.code,
        name: step.name,
        step_type: step.stepType,
        sort_order: step.sortOrder,
      },
    });
  }

  // Demote submitted from initial if payment step exists
  await prisma.workflowStep.updateMany({
    where: { workflow_id: ORDER_WORKFLOW_ID, code: 'submitted' },
    data: { step_type: 'intermediate' },
  });

  const stepRows = await prisma.workflowStep.findMany({
    where: { workflow_id: ORDER_WORKFLOW_ID },
    select: { id: true, code: true },
  });
  const stepIds = Object.fromEntries(stepRows.map((s) => [s.code, s.id]));

  for (const t of EXTRA_TRANSITIONS) {
    const fromStepId = stepIds[t.from];
    const toStepId = stepIds[t.to];
    if (!toStepId) continue;

    const existing = await prisma.workflowTransition.findFirst({
      where: {
        workflow_id: ORDER_WORKFLOW_ID,
        from_step_id: fromStepId ?? null,
        to_step_id: toStepId,
        trigger_type: 'manual',
      },
    });
    if (!existing) {
      await prisma.workflowTransition.create({
        data: {
          workflow_id: ORDER_WORKFLOW_ID,
          from_step_id: fromStepId ?? null,
          to_step_id: toStepId,
          trigger_type: 'manual',
        },
      });
      console.log('transition', t.from, '->', t.to);
    }
  }

  // Platform default min daily 1000 EGP
  const ruleType = await prisma.ruleType.findUnique({ where: { code: 'min_daily_order_amount' } });
  if (ruleType) {
    const existing = await prisma.businessRule.findFirst({
      where: { rule_type_id: ruleType.id, scope_type: 'platform', scope_id: null },
    });
    if (!existing) {
      await prisma.businessRule.create({
        data: {
          rule_type_id: ruleType.id,
          scope_type: 'platform',
          scope_id: null,
          value: { amount: 1000, currency: 'EGP' },
          priority: 0,
        },
      });
      console.log('created platform min_daily_order_amount 1000 EGP');
    }
  }

  console.log('ecommerce workflow seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
