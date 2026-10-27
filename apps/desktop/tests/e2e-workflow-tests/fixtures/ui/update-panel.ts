import { readdir } from 'node:fs/promises';

import type { Page } from '@playwright/test';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { expect } from '../runtime/local-electron-driver';

import { getByAutomationId } from './automation';

/** Public update status attributes exposed by the real Updates panel. */
export interface UpdateSnapshot {
  readonly state: string | null;
  readonly supported: string | null;
  readonly currentVersion: string | null;
  readonly latestVersion: string | null;
  readonly lastCheckedAt: string | null;
}

/** One sampled public download progress row. */
export interface DownloadSample {
  readonly progress: number;
  readonly downloadedBytes: number;
  readonly totalBytes: number;
  readonly bytesPerSecond: number | null;
  readonly etaSeconds: number | null;
}

/** Open Updates through public navigation without injecting responses or state. */
export async function openUpdatesPanel(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.updates).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.settings.updates.status)).toBeVisible();
  await expect(page.locator([
    '[data-automation-id^="settings.updates.github-"]',
    '[data-automation-id="settings.updates.device-code"]',
    '[data-automation-id="settings.updates.open-github"]',
  ].join(', '))).toHaveCount(0);
}

/** Read the public status attributes of the real Updates panel. */
export async function readUpdateStatus(page: Page): Promise<UpdateSnapshot> {
  const status = getByAutomationId(page, AUTOMATION_IDS.settings.updates.status);
  return {
    state: await status.getAttribute('data-state'),
    supported: await status.getAttribute('data-supported'),
    currentVersion: await status.getAttribute('data-current-version'),
    latestVersion: await status.getAttribute('data-latest-version'),
    lastCheckedAt: await status.getAttribute('data-last-checked-at'),
  };
}

/** Wait for a real terminal check result, retrying once through the original Check action. */
export async function waitForTerminalUpdateStatus(page: Page): Promise<UpdateSnapshot> {
  const status = getByAutomationId(page, AUTOMATION_IDS.settings.updates.status);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await expect(status).toHaveAttribute('data-state', /^(up-to-date|available|failed)$/, {
      timeout: 120_000,
    });
    const snapshot = await readUpdateStatus(page);
    if (snapshot.state !== 'failed') {
      return snapshot;
    }
    const check = getByAutomationId(page, AUTOMATION_IDS.settings.updates.check);
    if (await check.count() === 0) {
      return snapshot;
    }
    const previous = await status.getAttribute('data-last-checked-at');
    await check.click();
    await expect.poll(() => status.getAttribute('data-last-checked-at')).not.toBe(previous);
  }
  return readUpdateStatus(page);
}

/** Sample the real DOM state and download progress without calling product APIs. */
export async function readDownloadSample(page: Page): Promise<{
  state: string | null;
  sample: DownloadSample | null;
}> {
  return page.evaluate(([statusId, progressId]) => {
    const statusElement = document.querySelector(`[data-automation-id="${statusId}"]`);
    const progressElement = document.querySelector(`[data-automation-id="${progressId}"]`);
    const progress = progressElement?.getAttribute('data-progress');
    const downloaded = progressElement?.getAttribute('data-downloaded-bytes');
    const total = progressElement?.getAttribute('data-total-bytes');
    const bytesPerSecond = progressElement?.getAttribute('data-bytes-per-second');
    const etaSeconds = progressElement?.getAttribute('data-eta-seconds');
    return {
      state: statusElement?.getAttribute('data-state') ?? null,
      sample: progress === null || progress === undefined ||
        downloaded === null || downloaded === undefined ||
        total === null || total === undefined
        ? null
        : {
            progress: Number(progress),
            downloadedBytes: Number(downloaded),
            totalBytes: Number(total),
            bytesPerSecond: bytesPerSecond === null || bytesPerSecond === undefined
              ? null
              : Number(bytesPerSecond),
            etaSeconds: etaSeconds === null || etaSeconds === undefined
              ? null
              : Number(etaSeconds),
          },
    };
  }, [AUTOMATION_IDS.settings.updates.status, AUTOMATION_IDS.settings.updates.progress] as const);
}

/** Record relative file names and kinds; null when the directory is absent. */
export async function listTree(directory: string): Promise<string[] | null> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .map((entry) => `${entry.name}:${entry.isFile() ? 'file' : 'directory'}`)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
