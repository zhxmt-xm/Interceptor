import { writeFile } from 'node:fs/promises';

import type { CollectionNode } from '@interceptor/core-protocol';
import { dialog } from 'electron';

export async function exportCollection(nodes: readonly CollectionNode[], title?: string, abortSignal?: AbortSignal): Promise<boolean> {
  abortSignal?.throwIfAborted();
  const selection = await dialog.showSaveDialog({
    ...(title === undefined ? {} : { title }),
    defaultPath: `interceptor-collection-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  abortSignal?.throwIfAborted();
  if (selection.canceled || !selection.filePath) return false;
  await writeFile(selection.filePath, JSON.stringify({ nodes }, null, 2), 'utf8');
  return true;
}