import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { enqueueJob } from '../jobs/jobQueue';
import { notificationEngine } from './notificationEngine';

export interface WorkflowActionContext {
  instanceId: string;
  workflowId: string;
  entityType: string;
  entityId: string;
  stepId: string;
  stepCode: string;
}

export const workflowActionDispatcher = {
  async dispatch(
    actionType: string,
    actionConfig: Prisma.JsonValue,
    context: WorkflowActionContext,
  ): Promise<void> {
    switch (actionType) {
      case 'notify': {
        const config = actionConfig as {
          templateCode?: string;
          recipientType?: 'company_user' | 'dashboard_user';
          recipientId?: string;
          languageCode?: string;
          channels?: string[];
        };
        if (config.templateCode && config.recipientType && config.recipientId) {
          await notificationEngine.queueNotification({
            templateCode: config.templateCode,
            channels: config.channels,
            recipientType: config.recipientType,
            recipientId: config.recipientId,
            languageCode: config.languageCode,
            relatedEntityType: context.entityType,
            relatedEntityId: context.entityId,
          });
        } else {
          await enqueueJob({
            jobType: 'workflow.notify',
            payload: { actionConfig, ...context },
            queueName: 'workflow',
          });
        }
        break;
      }

      case 'webhook':
        await enqueueJob({
          jobType: 'workflow.webhook',
          payload: { actionConfig, ...context },
          queueName: 'workflow',
        });
        break;

      case 'escalate':
        await enqueueJob({
          jobType: 'workflow.escalate',
          payload: { actionConfig, ...context },
          queueName: 'workflow',
        });
        break;

      case 'auto_transition': {
        const config = actionConfig as { toStepCode?: string };
        if (!config.toStepCode) {
          break;
        }
        const targetStep = await prisma.workflowStep.findFirst({
          where: { workflow_id: context.workflowId, code: config.toStepCode },
        });
        if (targetStep) {
          const { workflowEngine } = await import('./workflowEngine');
          await workflowEngine.transition({
            instanceId: context.instanceId,
            toStepId: targetStep.id,
            triggerType: 'automatic',
          });
        }
        break;
      }

      case 'require_approval': {
        const config = actionConfig as { approvalWorkflowId?: string; entityType?: string };
        const { approvalEngine } = await import('./approvalEngine');
        const { getRequestActor } = await import('../core/middleware/requestContext');
        const actor = getRequestActor();
        await approvalEngine.createRequest({
          approvalWorkflowId: config.approvalWorkflowId,
          entityType: config.entityType ?? context.entityType,
          entityId: context.entityId,
          requestedBy: {
            type: actor?.type ?? 'system',
            id: actor?.id ?? context.entityId,
          },
        });
        break;
      }

      default:
        break;
    }
  },

  async dispatchStepActions(
    stepId: string,
    context: Omit<WorkflowActionContext, 'stepId' | 'stepCode'>,
  ): Promise<void> {
    const step = await prisma.workflowStep.findUnique({
      where: { id: stepId },
      include: { actions: true },
    });
    if (!step) {
      return;
    }

    for (const action of step.actions) {
      await this.dispatch(action.action_type, action.action_config, {
        ...context,
        stepId: step.id,
        stepCode: step.code,
      });
    }
  },
};
