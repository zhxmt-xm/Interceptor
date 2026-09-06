import type { TransferJobSnapshot } from '@interceptor/core-protocol';

export function redactTransferJob(job: TransferJobSnapshot) {
  return {
    id: job.id,
    kind: job.kind,
    state: job.state,
    processed: job.processed,
    total: job.total,
    startedAt: job.startedAt,
    ...(job.completedAt === undefined ? {} : { completedAt: job.completedAt }),
    warningCount: job.warnings.length,
  };
}