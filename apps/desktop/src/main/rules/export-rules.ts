import { writeFile } from 'node:fs/promises';

import type { RuleNode } from '@interceptor/core-protocol';
import { dialog } from 'electron';

import type { CoreRuntime } from '../core/core-runtime';

export async function exportSavedRules(coreRuntime: CoreRuntime, abortSignal: AbortSignal): Promise<boolean> {
  abortSignal.throwIfAborted();
  const { payload } = await coreRuntime.request({ type: 'rules.get', payload: {} }, { abortSignal });
  return exportRules(payload.ruleSet.nodes, undefined, abortSignal);
}

export async function exportRules(
  nodes: readonly RuleNode[],
  title?: string,
  abortSignal?: AbortSignal,
): Promise<boolean> {
  abortSignal?.throwIfAborted();
  const selection = await dialog.showSaveDialog({
    ...(title === undefined ? {} : { title }),
    defaultPath: `interceptor-rules-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  abortSignal?.throwIfAborted();
  if (selection.canceled || !selection.filePath) return false;
  await writeFile(selection.filePath, JSON.stringify({ nodes }, null, 2), 'utf8');
  return true;
}