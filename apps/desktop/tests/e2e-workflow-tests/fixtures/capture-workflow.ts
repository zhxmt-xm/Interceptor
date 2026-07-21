import { expect, type Locator } from '@playwright/test';

import { AUTOMATION_ID_PREFIXES } from '../../../src/shared/automation-ids';
import { getByAutomationIdPrefix } from './automation';
import type { LocalElectronApplicationDriver } from './local-electron-driver';
import type { LoopbackLab } from './loopback-lab';

interface CaptureExchangeOptions {
  requestPath: string;
  method?: string;
  body?: string;
}

interface CapturedExchange {
  row: Locator;
  response: {
    statusCode: number | undefined;
    body: string;
  };
}

/** Creates deterministic real Capture exchanges through only public application boundaries. */
export class CaptureWorkflowFixture {
  /** Start recording, proxy one loopback request, wait for its UI row and select it. */
  static async captureAndSelect(
    desktopApp: LocalElectronApplicationDriver,
    loopbackLab: LoopbackLab,
    options: CaptureExchangeOptions,
  ): Promise<CapturedExchange> {
    const { page } = desktopApp;
    const response = await loopbackLab.requestThroughProxy(
      desktopApp.capturePort(),
      options.requestPath,
      {
        method: options.method,
        body: options.body,
      },
    );
    expect(response.statusCode).toBe(200);

    const displayPath = new URL(
      loopbackLab.url(options.requestPath),
    ).pathname;
    const row = getByAutomationIdPrefix(
      page,
      AUTOMATION_ID_PREFIXES.captureRequestRow,
    )
      .filter({ hasText: displayPath });
    await expect(row).toBeVisible();
    await row.click();
    return { row, response };
  }
}
