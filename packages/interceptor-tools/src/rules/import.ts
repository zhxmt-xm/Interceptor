import { rejectUnknownKeys } from '../arguments/entry';
import type { InterceptorToolDefinition } from '../interfaces';

export function buildRulesImportTool(): InterceptorToolDefinition {
  return {
    name: 'rules_import',
    title: 'Import Rules',
    description: 'Choose an exported Rule file and confirm appending it through the product import preview.',
    effectDescription: 'Append Rules with new identities and persist them with the current Rule draft after confirmation.',
    capabilityId: 'rules',
    kind: 'change',
    destructive: false,
    openWorld: false,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async describeChange(args, context) {
      rejectUnknownKeys(args, []);
      context.abortSignal.throwIfAborted();
      return {
        lines: [
          'Choose a JSON file using the native Open Dialog.',
          'Review the import preview, then confirm to append Rules and persist the current draft.',
        ],
      };
    },
    async execute(args, context) {
      rejectUnknownKeys(args, []);
      context.abortSignal.throwIfAborted();
      try {
        const { payload } = await context.host.invokeMain({ type: 'rules.import', payload: {} }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        if (!payload.imported) return { imported: false };
        return {
          imported: true,
          revision: payload.revision,
          ruleCount: payload.ruleCount,
          folderCount: payload.folderCount,
          enabledCount: payload.enabledCount,
          skippedCount: payload.skippedCount,
        };
      } catch {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to import Rules.');
      }
    },
  };
}