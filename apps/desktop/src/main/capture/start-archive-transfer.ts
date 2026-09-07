import { randomUUID } from 'node:crypto';

import type { TransferJobSnapshot } from '@interceptor/core-protocol';
import { dialog } from 'electron';

import type { CoreRuntime } from '../core/core-runtime';

export async function startArchiveExport(coreRuntime: CoreRuntime, title?: string, abortSignal?: AbortSignal): Promise<TransferJobSnapshot | null> {
  abortSignal?.throwIfAborted();
  const selection = await dialog.showSaveDialog({
    ...(title === undefined ? {} : { title }),
    defaultPath: `interceptor-${new Date().toISOString().slice(0, 10)}.iarchive`,
    filters: [{ name: 'Interceptor Archive', extensions: ['iarchive'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  abortSignal?.throwIfAborted();
  if (selection.canceled || !selection.filePath) return null;
  const result = await coreRuntime.request({
    type: 'archive.export.start', payload: { jobId: `transfer-${randomUUID()}`, filePath: selection.filePath },
  }, abortSignal === undefined ? {} : { abortSignal });
  return result.payload.job;
}

export async function startArchiveImport(coreRuntime: CoreRuntime, title?: string, abortSignal?: AbortSignal): Promise<TransferJobSnapshot | null> {
  abortSignal?.throwIfAborted();
  const selection = await dialog.showOpenDialog({
    ...(title === undefined ? {} : { title }),
    filters: [{ name: 'Interceptor Archive', extensions: ['iarchive'] }],
    properties: ['openFile'],
  });
  abortSignal?.throwIfAborted();
  const [filePath] = selection.filePaths;
  if (selection.canceled || !filePath) return null;
  const result = await coreRuntime.request({
    type: 'archive.import.start', payload: { jobId: `transfer-${randomUUID()}`, filePath },
  }, abortSignal === undefined ? {} : { abortSignal });
  return result.payload.job;
}