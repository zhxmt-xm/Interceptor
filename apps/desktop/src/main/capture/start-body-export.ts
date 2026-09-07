import { randomUUID } from 'node:crypto';

import type { TransferJobSnapshot } from '@interceptor/core-protocol';
import type { MainToolPayloadForType } from '@interceptor/tools';
import { dialog } from 'electron';

import { suggestedBodyFileName } from '../../shared/body-file-name';
import type { BodyExportRequest } from '../../shared/desktop-api';
import type { CoreRuntime } from '../core/core-runtime';
import { toSafeBodyFileName } from '../utils';
import type { BodyExportTarget } from './interfaces';

export async function startBodyExport(
  coreRuntime: CoreRuntime,
  target: BodyExportTarget,
  title?: string,
  abortSignal?: AbortSignal,
): Promise<TransferJobSnapshot | null> {
  abortSignal?.throwIfAborted();
  const generation = coreRuntime.getCoreProcessStatus();
  const request = target.kind === 'exchange-body'
    ? await readCapturedBodyExportRequest(coreRuntime, target, abortSignal)
    : target;
  if (target.kind === 'exchange-body') assertCoreGeneration(coreRuntime, generation);
  const filePath = await chooseBodyDestination(request.suggestedName, title, abortSignal);
  if (filePath === null) return null;
  if (target.kind === 'exchange-body') {
    await readCapturedBodyExportRequest(coreRuntime, target, abortSignal);
    assertCoreGeneration(coreRuntime, generation);
  }
  return startBodyExportJob(coreRuntime, request.bodyId, filePath, abortSignal);
}

async function readCapturedBodyExportRequest(
  coreRuntime: CoreRuntime,
  identity: MainToolPayloadForType<'capture.body.export'>,
  abortSignal?: AbortSignal,
): Promise<BodyExportRequest> {
  abortSignal?.throwIfAborted();
  const { payload } = await coreRuntime.request({
    type: 'sessions.detail', payload: { exchangeId: identity.exchangeId },
  }, abortSignal === undefined ? {} : { abortSignal });
  abortSignal?.throwIfAborted();
  const detail = payload.detail;
  if (detail === null) throw new Error('The captured body is no longer available.');
  const match = ([
    ['request-body', detail.requestBody],
    ['response-body', detail.responseBody],
    ['request-body', detail.requestBodyEffect?.originalBody],
    ['response-body', detail.responseBodyEffect?.originalBody],
  ] as const).find(([, body]) => body?.bodyHash === identity.bodyId);
  if (match === undefined || match[1] === undefined) throw new Error('The captured body is no longer available.');
  return {
    bodyId: identity.bodyId,
    suggestedName: suggestedBodyFileName(detail.url, match[1].mediaType, match[0]),
  };
}

function assertCoreGeneration(coreRuntime: CoreRuntime, generation: ReturnType<CoreRuntime['getCoreProcessStatus']>): void {
  const current = coreRuntime.getCoreProcessStatus();
  if (current.pid !== generation.pid || current.startedAt !== generation.startedAt) {
    throw new Error('The captured body is no longer available.');
  }
}

async function chooseBodyDestination(suggestedName: string, title?: string, abortSignal?: AbortSignal): Promise<string | null> {
  abortSignal?.throwIfAborted();
  const selection = await dialog.showSaveDialog({
    ...(title === undefined ? {} : { title }),
    defaultPath: toSafeBodyFileName(suggestedName),
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  abortSignal?.throwIfAborted();
  return selection.canceled || !selection.filePath ? null : selection.filePath;
}

async function startBodyExportJob(coreRuntime: CoreRuntime, bodyId: string, filePath: string, abortSignal?: AbortSignal): Promise<TransferJobSnapshot | null> {
  abortSignal?.throwIfAborted();
  const result = await coreRuntime.request({
    type: 'body.export.start', payload: { jobId: `transfer-${randomUUID()}`, filePath, bodyId },
  }, abortSignal === undefined ? {} : { abortSignal });
  return result.payload.job;
}