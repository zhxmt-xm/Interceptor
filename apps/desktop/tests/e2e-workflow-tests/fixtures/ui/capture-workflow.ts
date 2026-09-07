import { expect, type Locator } from '@playwright/test';

import {
  AUTOMATION_ID_PREFIXES,
  AUTOMATION_IDS,
} from '../../../../src/shared/automation-ids';
import { getByAutomationId, getByAutomationIdPrefix } from './automation';
import type { LocalElectronApplicationDriver } from '../runtime/local-electron-driver';
import type { HttpTrafficRunner } from '../../../../../playground/server/scenarios/traffic-lab';

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

/** Start real Recording through the same readiness interaction available to users. */
export async function startRecording(
  desktopApp: LocalElectronApplicationDriver,
): Promise<void> {
  const recording = getByAutomationId(
    desktopApp.page,
    AUTOMATION_IDS.capture.recordingToggle,
  );
  if (await recording.getAttribute('aria-pressed') === 'true') {
    return;
  }
  await recording.click();
  await getByAutomationId(
    desktopApp.page,
    AUTOMATION_IDS.capture.readiness.enable,
  ).click();
  await expect(recording).toHaveAttribute('aria-pressed', 'true');
}

/** Creates deterministic real Capture exchanges through only public application boundaries. */
export class CaptureWorkflowFixture {
  /** Start recording, proxy one loopback request, wait for its UI row and select it. */
  static async captureAndSelect(
    desktopApp: LocalElectronApplicationDriver,
    loopbackLab: HttpTrafficRunner,
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
