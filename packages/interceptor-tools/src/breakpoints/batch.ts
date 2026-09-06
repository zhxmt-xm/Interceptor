import type { BreakpointQueueKey, CoreCommand } from '@interceptor/core-protocol';

import { InterceptorToolArgumentError, rejectUnknownKeys, requireString } from '../arguments/entry';
import type { InterceptorToolDefinition } from '../interfaces';

const QUEUE_KEY_PATTERN = '^(?:http|ws:\\S+)$';

export function buildBreakpointBatchTools(): readonly InterceptorToolDefinition[] {
  return [
    buildQueueTool({
      name: 'breakpoints_continue_queue', title: 'Continue breakpoint queue',
      description: 'Forward all currently pending items in one logical queue unchanged.',
      createCommand: (queueKey) => ({ type: 'breakpoint.continueQueue', payload: { queueKey } }), destructive: false,
    }),
    buildQueueTool({
      name: 'breakpoints_drop_queue', title: 'Drop breakpoint queue',
      description: 'Discard all currently pending items in one logical queue.',
      createCommand: (queueKey) => ({ type: 'breakpoint.dropQueue', payload: { queueKey } }), destructive: true,
    }),
    {
      name: 'breakpoints_continue_rule', title: 'Continue breakpoints from one Rule',
      description: 'Forward all currently pending items from one Rule unchanged.',
      effectDescription: 'Resolve the matching items present when the command starts; do not apply editor drafts.',
      capabilityId: 'breakpoints', kind: 'change', destructive: false, openWorld: false,
      inputSchema: {
        type: 'object', properties: { ruleId: { type: 'string', minLength: 1, description: 'Non-blank Rule identity from a pending breakpoint.' } },
        required: ['ruleId'], additionalProperties: false,
      },
      async describeChange(args, context) {
        const ruleId = readRuleId(args);
        context.abortSignal.throwIfAborted();
        const { payload } = await context.host.invoke({ type: 'breakpoint.list', payload: {} }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        const pendingCount = payload.breakpoints.filter((breakpoint) => breakpoint.ruleId === ruleId).length;
        return { lines: [`Rule: ${ruleId}`, `Currently pending: ${pendingCount}`], metadata: { ruleId, pendingCount } };
      },
      async execute(args, context) {
        const ruleId = readRuleId(args);
        context.abortSignal.throwIfAborted();
        const { payload } = await context.host.invoke({ type: 'breakpoint.continueRule', payload: { ruleId } }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        return { resolvedCount: payload.resolvedCount };
      },
    },
  ];
}

function buildQueueTool(options: {
  name: string;
  title: string;
  description: string;
  createCommand(queueKey: BreakpointQueueKey): Extract<CoreCommand, { type: 'breakpoint.continueQueue' | 'breakpoint.dropQueue' }>;
  destructive: boolean;
}): InterceptorToolDefinition {
  return {
    name: options.name, title: options.title, description: options.description,
    effectDescription: 'Resolve only the target queue items present when the command starts; do not apply editor drafts.',
    capabilityId: 'breakpoints', kind: 'change', destructive: options.destructive, openWorld: false,
    inputSchema: {
      type: 'object',
      properties: { queueKey: { type: 'string', minLength: 4, description: 'Logical queue key from breakpoints_list: http or ws:<exchangeId>.' } },
      required: ['queueKey'], additionalProperties: false,
    },
    async describeChange(args, context) {
      const queueKey = readQueueKey(args);
      context.abortSignal.throwIfAborted();
      const { payload } = await context.host.invoke({ type: 'breakpoint.list', payload: {} }, context.abortSignal);
      context.abortSignal.throwIfAborted();
      const pendingCount = payload.breakpoints.filter((breakpoint) => breakpoint.queueKey === queueKey).length;
      return { lines: [`Queue: ${queueKey}`, `Currently pending: ${pendingCount}`], metadata: { queueKey, pendingCount } };
    },
    async execute(args, context) {
      const queueKey = readQueueKey(args);
      context.abortSignal.throwIfAborted();
      const { payload } = await context.host.invoke(options.createCommand(queueKey), context.abortSignal);
      context.abortSignal.throwIfAborted();
      return { resolvedCount: payload.resolvedCount };
    },
  };
}

function readQueueKey(args: Readonly<Record<string, unknown>>): BreakpointQueueKey {
  rejectUnknownKeys(args, ['queueKey']);
  const queueKey = requireString(args, 'queueKey');
  if (!new RegExp(QUEUE_KEY_PATTERN).test(queueKey)) throw new InterceptorToolArgumentError('queueKey must be http or ws:<exchangeId>');
  return queueKey as BreakpointQueueKey;
}

function readRuleId(args: Readonly<Record<string, unknown>>): string {
  rejectUnknownKeys(args, ['ruleId']);
  const ruleId = requireString(args, 'ruleId');
  if (ruleId.trim().length === 0) throw new InterceptorToolArgumentError('ruleId must be a non-empty Rule identity');
  return ruleId;
}