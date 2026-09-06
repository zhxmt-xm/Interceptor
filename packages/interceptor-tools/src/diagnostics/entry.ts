import { InterceptorToolArgumentError, rejectUnknownKeys, requireEnum, requireIntegerInRange, requireString } from '../arguments/entry';
import type { InterceptorToolDefinition, MainToolPayloadForType } from '../interfaces';
import { redactTransferJob } from '../transfer/utils';

const PROCESSES = ['core', 'main', 'renderer'] as const;
const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
const OUTCOMES = ['success', 'failed', 'cancelled', 'timed_out'] as const;

export function buildDiagnosticsTools(): readonly InterceptorToolDefinition[] {
  return [{
    name: 'diagnostics_get_trace', title: 'Get current Core trace',
    description: 'Read up to 200 records for one trace from the current Core process, in recorded order.',
    capabilityId: 'diagnostics', kind: 'query', destructive: false, openWorld: false,
    inputSchema: {
      type: 'object', properties: { traceId: { type: 'string', minLength: 1, description: 'Trace identity from a Diagnostics record.' } },
      required: ['traceId'], additionalProperties: false,
    },
    async execute(args, context) {
      rejectUnknownKeys(args, ['traceId']);
      const traceId = requireString(args, 'traceId');
      if (traceId.trim().length === 0) throw new InterceptorToolArgumentError('traceId must be a non-empty trace identity');
      context.abortSignal.throwIfAborted();
      const { payload } = await context.host.invoke({ type: 'diagnostics.recent', payload: { limit: 200, traceId } }, context.abortSignal);
      context.abortSignal.throwIfAborted();
      return { traceId, records: payload.records, droppedCount: payload.droppedCount };
    },
  }, {
    name: 'diagnostics_get_recent', title: 'Get recent Core diagnostics',
    description: 'Read recent records from the current Core process in recorded order, without querying persisted history.',
    capabilityId: 'diagnostics', kind: 'query', destructive: false, openWorld: false,
    inputSchema: {
      type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 200, default: 200, description: 'Maximum number of recent records.' } },
      additionalProperties: false,
    },
    async execute(args, context) {
      rejectUnknownKeys(args, ['limit']);
      const limit = args['limit'] === undefined ? 200 : requireIntegerInRange(args, 'limit', { minimum: 1, maximum: 200 });
      context.abortSignal.throwIfAborted();
      const { payload } = await context.host.invoke({ type: 'diagnostics.recent', payload: { limit } }, context.abortSignal);
      context.abortSignal.throwIfAborted();
      return { records: payload.records, droppedCount: payload.droppedCount };
    },
  }, {
    name: 'diagnostics_export', title: 'Export Diagnostics',
    description: 'Start an atomic redacted JSONL export using the native Save Dialog and existing transfer service.',
    effectDescription: 'Choose a destination and start exporting persisted diagnostic records; starting a job does not mean the export has completed.',
    capabilityId: 'diagnostics', kind: 'change', destructive: false, openWorld: false,
    inputSchema: {
      type: 'object', properties: {
        process: { type: 'string', enum: PROCESSES, description: 'Originating process.' },
        level: { type: 'string', enum: LEVELS, description: 'Minimum record severity.' },
        outcome: { type: 'string', enum: OUTCOMES, description: 'Command outcome.' },
      }, additionalProperties: false,
    },
    async describeChange(args, context) {
      const filter = readExportFilter(args);
      context.abortSignal.throwIfAborted();
      return { lines: [
        `Process: ${filter.process ?? 'all'}`, `Minimum level: ${filter.level ?? 'all'}`, `Outcome: ${filter.outcome ?? 'all'}`,
      ], metadata: { ...filter } };
    },
    async execute(args, context) {
      const filter = readExportFilter(args);
      context.abortSignal.throwIfAborted();
      try {
        const { payload } = await context.host.invokeMain({ type: 'diagnostics.export', payload: filter }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        if (payload.job === null) return { started: false };
        return { started: true, job: redactTransferJob(payload.job) };
      } catch {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to export Diagnostics.');
      }
    },
  }];
}

function readExportFilter(args: Readonly<Record<string, unknown>>): MainToolPayloadForType<'diagnostics.export'> {
  rejectUnknownKeys(args, ['process', 'level', 'outcome']);
  return {
    ...(args['process'] === undefined ? {} : { process: requireEnum(args, 'process', PROCESSES) }),
    ...(args['level'] === undefined ? {} : { level: requireEnum(args, 'level', LEVELS) }),
    ...(args['outcome'] === undefined ? {} : { outcome: requireEnum(args, 'outcome', OUTCOMES) }),
  };
}