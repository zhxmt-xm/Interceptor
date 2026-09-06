import { collectLeaves, type RuleNode } from '@interceptor/core-protocol';

import { rejectUnknownKeys } from '../arguments/entry';
import type { InterceptorToolDefinition } from '../interfaces';

export function buildRulesExportTool(): InterceptorToolDefinition {
  return {
    name: 'rules_export',
    title: 'Export Rules',
    description: 'Export the saved Rule tree to a JSON file chosen through the native Save Dialog.',
    effectDescription: 'Save the persisted Rules to a JSON file without changing the Rule tree or unsaved drafts.',
    capabilityId: 'rules',
    kind: 'change',
    destructive: false,
    openWorld: false,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async describeChange(args, context) {
      rejectUnknownKeys(args, []);
      context.abortSignal.throwIfAborted();
      try {
        const { payload } = await context.host.invoke({ type: 'rules.get', payload: {} }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        const ruleCount = collectLeaves(payload.ruleSet.nodes).length;
        const folderCount = countFolders(payload.ruleSet.nodes);
        return {
          lines: [`Saved Rules: ${ruleCount}`, `Saved folders: ${folderCount}`],
          metadata: { ruleCount, folderCount },
        };
      } catch {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to export Rules.');
      }
    },
    async execute(args, context) {
      rejectUnknownKeys(args, []);
      context.abortSignal.throwIfAborted();
      try {
        const { payload } = await context.host.invokeMain({ type: 'rules.export', payload: {} }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        return { exported: payload.exported };
      } catch {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to export Rules.');
      }
    },
  };
}

function countFolders(nodes: readonly RuleNode[]): number {
  return nodes.reduce((count, node) => node.kind === 'folder'
    ? count + 1 + countFolders(node.children)
    : count, 0);
}