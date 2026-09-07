import { z } from 'zod';

import { InterceptorToolArgumentError, rejectUnknownKeys } from '../arguments/entry';
import type { InterceptorToolDefinition, InterceptorToolJsonSchema, MainToolPayloadForType } from '../interfaces';
import { redactTransferJob } from './utils';

const exportSchema = z.strictObject({
  scope: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('all') }),
    z.strictObject({ kind: z.literal('selected'), exchangeIds: z.array(z.string().min(1).regex(/\S/)).min(1) }),
    z.strictObject({ kind: z.literal('filter'), filter: z.strictObject({
      host: z.string().optional(), method: z.string().optional(), status: z.number().int().nonnegative().optional(),
      mime: z.string().optional(), appName: z.string().optional(), search: z.string().optional(),
      protocol: z.enum(['h1', 'h2', 'ws']).optional(),
    }) }),
  ]),
  redaction: z.strictObject({ authorization: z.boolean(), cookies: z.boolean(), bodies: z.boolean() }),
});

export function buildHarTransferTools(): readonly InterceptorToolDefinition[] {
  return [{
    name: 'capture_export_har', title: 'Export HAR',
    description: 'Export captured HTTP exchanges as HAR 1.2 through the native Save Dialog.',
    effectDescription: 'Save the selected Capture scope using the explicit redaction choices; starting the file job does not mean it has completed.',
    capabilityId: 'capture', kind: 'change', destructive: false, openWorld: false,
    inputSchema: z.toJSONSchema(exportSchema) as InterceptorToolJsonSchema,
    async describeChange(args, context) {
      const options = readExportOptions(args);
      context.abortSignal.throwIfAborted();
      return {
        lines: [
          `Scope: ${options.scope.kind}`,
          ...(options.scope.kind === 'selected' ? [`Selected exchanges: ${options.scope.exchangeIds.length}`] : []),
          `Mask authorization: ${options.redaction.authorization}`,
          `Mask cookies: ${options.redaction.cookies}`,
          `Strip bodies: ${options.redaction.bodies}`,
          'Choose the destination using the native Save Dialog.',
        ],
        metadata: { scopeKind: options.scope.kind, ...options.redaction },
      };
    },
    async execute(args, context) {
      const options = readExportOptions(args);
      context.abortSignal.throwIfAborted();
      try {
        const { payload } = await context.host.invokeMain({ type: 'capture.har.export', payload: options }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        return payload.job === null ? { started: false } : { started: true, job: redactTransferJob(payload.job) };
      } catch {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to export HAR.');
      }
    },
  }, {
    name: 'capture_import_har', title: 'Import HAR',
    description: 'Import a HAR file chosen through the native Open Dialog into a separate Capture session.',
    effectDescription: 'Append the selected HAR to Capture without clearing existing exchanges; starting the file job does not mean it has completed.',
    capabilityId: 'capture', kind: 'change', destructive: false, openWorld: false,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async describeChange(args, context) {
      rejectUnknownKeys(args, []);
      context.abortSignal.throwIfAborted();
      return { lines: ['Choose a HAR file using the native Open Dialog.', 'Existing Capture data is preserved.'], metadata: {} };
    },
    async execute(args, context) {
      rejectUnknownKeys(args, []);
      context.abortSignal.throwIfAborted();
      try {
        const { payload } = await context.host.invokeMain({ type: 'capture.har.import', payload: {} }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        return payload.job === null ? { started: false } : { started: true, job: redactTransferJob(payload.job) };
      } catch {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to import HAR.');
      }
    },
  }];
}

function readExportOptions(args: Readonly<Record<string, unknown>>): MainToolPayloadForType<'capture.har.export'> {
  const parsed = exportSchema.safeParse(args);
  if (!parsed.success) throw new InterceptorToolArgumentError('Invalid HAR export parameters.');
  const options = parsed.data;
  if (options.scope.kind === 'selected' && new Set(options.scope.exchangeIds).size !== options.scope.exchangeIds.length) {
    throw new InterceptorToolArgumentError('Selected exchange identities must be unique.');
  }
  return options;
}