import { randomUUID } from 'node:crypto';

import type { TransferJobSnapshot } from '@interceptor/core-protocol';
import { dialog } from 'electron';

import type { HarExportRequest } from '../../shared/desktop-api';
import type { CoreRuntime } from '../core/core-runtime';

export async function startHarExport(coreRuntime: CoreRuntime, options: HarExportRequest, title?: string, abortSignal?: AbortSignal): Promise<TransferJobSnapshot | null> {
  abortSignal?.throwIfAborted();
  const selection = await dialog.showSaveDialog({
    ...(title === undefined ? {} : { title }),
    defaultPath: `interceptor-${new Date().toISOString().slice(0, 10)}.har`,
    filters: [{ name: 'HTTP Archive', extensions: ['har'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  abortSignal?.throwIfAborted();
  if (selection.canceled || !selection.filePath) return null;
  const result = await coreRuntime.request({
    type: 'har.export.start',
    payload: { jobId: `transfer-${randomUUID()}`, filePath: selection.filePath, scope: options.scope, redaction: options.redaction },
  }, abortSignal === undefined ? {} : { abortSignal });
  return result.payload.job;
}

export async function startHarImport(coreRuntime: CoreRuntime, title?: string, abortSignal?: AbortSignal): Promise<TransferJobSnapshot | null> {
  abortSignal?.throwIfAborted();
  const selection = await dialog.showOpenDialog({
    ...(title === undefined ? {} : { title }),
    filters: [{ name: 'HTTP Archive', extensions: ['har'] }],
    properties: ['openFile'],
  });
  abortSignal?.throwIfAborted();
  const [filePath] = selection.filePaths;
  if (selection.canceled || !filePath) return null;
  const result = await coreRuntime.request({
    type: 'har.import.start', payload: { jobId: `transfer-${randomUUID()}`, filePath },
  }, abortSignal === undefined ? {} : { abortSignal });
  return result.payload.job;
}