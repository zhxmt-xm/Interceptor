import type { TransferJobSnapshot } from '@interceptor/core-protocol';
import { describe, expect, it, vi } from 'vitest';

import { JobProgress } from '../../HarTransferDialog/JobProgress';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('文件任务进度公开状态', () => {
  it.each(['running', 'completed', 'failed', 'cancelled'] as const)('准确暴露%s任务的身份和进度而不公开文件路径', (state) => {
    const job: TransferJobSnapshot = {
      id: 'transfer-current', kind: 'archive-export', state, processed: 2, total: 4,
      fileName: 'capture.iarchive', startedAt: '2026-09-07T00:00:00.000Z', warnings: [],
    };
    const result = JobProgress({ job, error: null });
    const props = result.props as Record<string, unknown>;

    expect(props).toMatchObject({
      'data-automation-id': 'capture.transfer.progress',
      'data-transfer-job-id': job.id,
      'data-transfer-job-kind': job.kind,
      'data-transfer-job-state': state,
      'data-transfer-processed': 2,
      'data-transfer-total': 4,
    });
    expect(props).not.toHaveProperty('data-file-path');
  });
});