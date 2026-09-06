import { randomUUID } from 'node:crypto';

import type { TransferJobSnapshot } from '@interceptor/core-protocol';
import { dialog } from 'electron';

import type { DiagnosticsExportFilter } from '../../shared/desktop-api';
import type { CoreRuntime } from '../core/core-runtime';

export async function startDiagnosticsExport(
  coreRuntime: CoreRuntime,
  filter: DiagnosticsExportFilter,
  title?: string,
  abortSignal?: AbortSignal,
): Promise<TransferJobSnapshot | null> {
  abortSignal?.throwIfAborted();
  const selection = await dialog.showSaveDialog({
    ...(title === undefined ? {} : { title }),
    defaultPath: `interceptor-diagnostics-${new Date().toISOString().slice(0, 10)}.jsonl`,
    filters: [{ name: 'JSON Lines', extensions: ['jsonl'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  abortSignal?.throwIfAborted();
  if (selection.canceled || !selection.filePath) return null;
  const result = await coreRuntime.request({
    type: 'diagnostics.export.start',
    payload: { ...filter, jobId: `transfer-${randomUUID()}`, filePath: selection.filePath },
  }, abortSignal === undefined ? {} : { abortSignal });
  return result.payload.job;
}