import { InterceptorToolArgumentError, rejectUnknownKeys, requireString } from '../arguments/entry';
import type { InterceptorToolChangeDescription, InterceptorToolDefinition, InterceptorToolJsonSchema } from '../interfaces';
import { redactTransferJob } from './utils';

const JOB_INPUT_SCHEMA: InterceptorToolJsonSchema = {
  type: 'object',
  properties: { jobId: { type: 'string', minLength: 1, description: 'Identity of a file transfer created in the current Core process.' } },
  required: ['jobId'],
  additionalProperties: false,
};

export function buildTransferJobTools(): readonly InterceptorToolDefinition[] {
  return [{
    name: 'capture_get_transfer_job', title: 'Get file transfer job',
    description: 'Read one file transfer state and progress without revealing local file information.',
    capabilityId: 'capture', kind: 'query', destructive: false, openWorld: false,
    inputSchema: JOB_INPUT_SCHEMA,
    async execute(args, context) {
      const jobId = readJobId(args);
      context.abortSignal.throwIfAborted();
      try {
        const { payload } = await context.host.invoke({ type: 'transfer.job.get', payload: { jobId } }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        return { job: payload.job === null ? null : redactTransferJob(payload.job) };
      } catch {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to read transfer job.');
      }
    },
  }, {
    name: 'capture_cancel_transfer_job', title: 'Cancel file transfer job',
    description: 'Cancel one running file transfer; completed, failed and cancelled jobs stay unchanged.',
    effectDescription: 'Cancel only the selected running file transfer; existing saved files and other jobs are not removed.',
    capabilityId: 'capture', kind: 'change', destructive: false, openWorld: false,
    inputSchema: JOB_INPUT_SCHEMA,
    async describeChange(args, context): Promise<InterceptorToolChangeDescription> {
      const jobId = readJobId(args);
      context.abortSignal.throwIfAborted();
      try {
        const { payload } = await context.host.invoke({ type: 'transfer.job.get', payload: { jobId } }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        const job = payload.job;
        if (job === null) return { lines: [`Job: ${jobId}`, 'Job not found in the current Core process.'], metadata: { jobId, found: false } };
        return {
          lines: [`Job: ${jobId}`, `Kind: ${job.kind}`, `State: ${job.state}`, `Progress: ${job.processed}/${job.total}`],
          metadata: { jobId, found: true, kind: job.kind, state: job.state, processed: job.processed, total: job.total },
        };
      } catch {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to read transfer job.');
      }
    },
    async execute(args, context) {
      const jobId = readJobId(args);
      context.abortSignal.throwIfAborted();
      try {
        const { payload } = await context.host.invoke({ type: 'transfer.job.cancel', payload: { jobId } }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        return { job: payload.job === null ? null : redactTransferJob(payload.job) };
      } catch {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to cancel transfer job.');
      }
    },
  }];
}

function readJobId(args: Readonly<Record<string, unknown>>): string {
  rejectUnknownKeys(args, ['jobId']);
  const jobId = requireString(args, 'jobId');
  if (jobId.trim().length === 0) throw new InterceptorToolArgumentError('jobId must be a non-empty transfer identity');
  return jobId;
}