import { rejectUnknownKeys } from '../arguments/entry';
import type { InterceptorToolDefinition } from '../interfaces';
import { redactTransferJob } from './utils';

export function buildArchiveTransferTools(): readonly InterceptorToolDefinition[] {
  return [{
    name: 'capture_export_archive', title: 'Export Archive',
    description: 'Export all captured traffic as a native Interceptor Archive through the native Save Dialog.',
    effectDescription: 'Save a complete Capture snapshot including bodies, credentials and native evidence without redaction; starting the job does not mean it has completed.',
    capabilityId: 'capture', kind: 'change', destructive: false, openWorld: false,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async describeChange(args, context) {
      rejectUnknownKeys(args, []);
      context.abortSignal.throwIfAborted();
      return {
        lines: [
          'Export the complete Capture snapshot, including bodies, credentials and native evidence without redaction.',
          'Choose the destination using the native Save Dialog.',
        ],
        metadata: {},
      };
    },
    async execute(args, context) {
      rejectUnknownKeys(args, []);
      context.abortSignal.throwIfAborted();
      try {
        const { payload } = await context.host.invokeMain({ type: 'capture.archive.export', payload: {} }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        return payload.job === null ? { started: false } : { started: true, job: redactTransferJob(payload.job) };
      } catch {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to export Archive.');
      }
    },
  }, {
    name: 'capture_import_archive', title: 'Import Archive',
    description: 'Import a native Interceptor Archive chosen through the native Open Dialog into Capture.',
    effectDescription: 'Append the selected Archive to Capture without clearing existing exchanges; starting the job does not mean it has completed.',
    capabilityId: 'capture', kind: 'change', destructive: false, openWorld: false,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async describeChange(args, context) {
      rejectUnknownKeys(args, []);
      context.abortSignal.throwIfAborted();
      return { lines: ['Choose an Interceptor Archive using the native Open Dialog.', 'Existing Capture data is preserved.'], metadata: {} };
    },
    async execute(args, context) {
      rejectUnknownKeys(args, []);
      context.abortSignal.throwIfAborted();
      try {
        const { payload } = await context.host.invokeMain({ type: 'capture.archive.import', payload: {} }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        return payload.job === null ? { started: false } : { started: true, job: redactTransferJob(payload.job) };
      } catch {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to import Archive.');
      }
    },
  }];
}