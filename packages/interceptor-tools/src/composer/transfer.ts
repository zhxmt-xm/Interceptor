import { collectLeaves, type CollectionNode } from '@interceptor/core-protocol';

import { rejectUnknownKeys } from '../arguments/entry';
import type { InterceptorToolDefinition } from '../interfaces';

export function buildCollectionTransferTools(): readonly InterceptorToolDefinition[] {
  return [{
    name: 'composer_export_collection', title: 'Export Collection',
    description: 'Export the saved Collection to a JSON file chosen through the native Save Dialog.',
    effectDescription: 'Save the persisted Collection without sending requests or changing current edits.',
    capabilityId: 'composer', kind: 'change', destructive: false, openWorld: false,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async describeChange(args, context) {
      rejectUnknownKeys(args, []);
      context.abortSignal.throwIfAborted();
      try {
        const { payload } = await context.host.invoke({ type: 'collection.get', payload: {} }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        const requestCount = collectLeaves(payload.collection.nodes).length;
        const folderCount = countFolders(payload.collection.nodes);
        return { lines: [`Saved requests: ${requestCount}`, `Saved folders: ${folderCount}`], metadata: { requestCount, folderCount } };
      } catch {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to export Collection.');
      }
    },
    async execute(args, context) {
      rejectUnknownKeys(args, []);
      context.abortSignal.throwIfAborted();
      try {
        const { payload } = await context.host.invokeMain({ type: 'composer.collection.export', payload: {} }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        return { exported: payload.exported };
      } catch {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to export Collection.');
      }
    },
  }, {
    name: 'composer_import_collection', title: 'Import Collection',
    description: 'Choose an exported Collection and confirm appending it through the product import preview.',
    effectDescription: 'Append requests and folders with new identities after confirmation, without sending requests.',
    capabilityId: 'composer', kind: 'change', destructive: false, openWorld: false,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async describeChange(args, context) {
      rejectUnknownKeys(args, []);
      context.abortSignal.throwIfAborted();
      return { lines: ['Choose a JSON file using the native Open Dialog.', 'Review the import preview, then confirm to append and save the Collection.'] };
    },
    async execute(args, context) {
      rejectUnknownKeys(args, []);
      context.abortSignal.throwIfAborted();
      try {
        const { payload } = await context.host.invokeMain({ type: 'composer.collection.import', payload: {} }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        if (!payload.imported) return { imported: false };
        return { imported: true, revision: payload.revision, requestCount: payload.requestCount, folderCount: payload.folderCount, skippedCount: payload.skippedCount };
      } catch {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to import Collection.');
      }
    },
  }];
}

function countFolders(nodes: readonly CollectionNode[]): number {
  return nodes.reduce((count, node) => node.kind === 'folder' ? count + 1 + countFolders(node.children) : count, 0);
}