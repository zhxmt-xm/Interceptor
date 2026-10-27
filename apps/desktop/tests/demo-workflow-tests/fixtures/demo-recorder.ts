import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { CDPSession, Page } from '@playwright/test';

import { test as base } from '../../e2e-workflow-tests/fixtures/runtime/local-electron-driver';

export interface DemoCaption {
  en: string;
  zh: string;
}

export interface DemoRecorder {
  start(): Promise<void>;
  caption(text: DemoCaption): void;
  stop(): Promise<void>;
}

interface Frame {
  at: number;
  file: string;
}

interface CaptionRecord extends DemoCaption {
  start: number;
  end: number;
}

interface OpenCaption extends DemoCaption {
  start: number;
}

function createDemoRecorder(page: Page, directory: string): DemoRecorder {
  let client: CDPSession | undefined;
  let startedAt = 0;
  let started = false;
  let stopped = false;
  const frames: Frame[] = [];
  const captions: OpenCaption[] = [];
  const writes: Array<Promise<void>> = [];
  const writeErrors: unknown[] = [];

  return {
    async start(): Promise<void> {
      if (started) throw new Error('Demo recording already started.');
      await mkdir(directory, { recursive: true });
      const session = await page.context().newCDPSession(page);
      client = session;
      startedAt = Date.now();
      started = true;
      session.on('Page.screencastFrame', (event) => {
        if (stopped) return;
        const index = String(frames.length).padStart(5, '0');
        const file = path.join(directory, `frame-${index}.png`);
        frames.push({ at: Date.now() - startedAt, file });
        writes.push(writeFile(file, Buffer.from(event.data, 'base64'))
          .catch((error: unknown) => { writeErrors.push(error); }));
        void session.send('Page.screencastFrameAck', { sessionId: event.sessionId })
          .catch(() => undefined);
      });
      await session.send('Page.startScreencast', {
        format: 'png',
        maxWidth: 1600,
        maxHeight: 900,
        everyNthFrame: 1,
      });
      await page.waitForTimeout(300);
    },

    caption(text: DemoCaption): void {
      if (!started || stopped) throw new Error('Demo recording is not active.');
      captions.push({ ...text, start: Date.now() - startedAt });
    },

    async stop(): Promise<void> {
      if (!started || stopped) return;
      stopped = true;
      const endedAt = Date.now() - startedAt;
      await client?.send('Page.stopScreencast').catch(() => undefined);
      await client?.detach().catch(() => undefined);
      await Promise.all(writes);
      if (writeErrors.length > 0) throw writeErrors[0];

      const records: CaptionRecord[] = captions.map((caption, index) => ({
        ...caption,
        end: captions[index + 1]?.start ?? endedAt,
      })).filter((caption) => caption.end > caption.start + 50);

      await writeFile(path.join(directory, 'frames.json'), JSON.stringify(frames), 'utf8');
      await writeFile(path.join(directory, 'captions.json'), JSON.stringify(records, null, 2), 'utf8');
      await writeFile(path.join(directory, 'timeline.json'), `${JSON.stringify({
        start: 0,
        end: endedAt,
        captions: records.map(({ start, end, en, zh }) => ({ start, end, en, zh })),
      }, null, 2)}\n`, 'utf8');
    },
  };
}

export const test = base.extend<{ demo: DemoRecorder }>({
  demo: async ({ desktopApp }, use, testInfo) => {
    const directory = process.env.INTERCEPTOR_DEMO_OUTPUT ?? testInfo.outputPath('capture');
    const recorder = createDemoRecorder(desktopApp.page, directory);
    await use(recorder);
    await recorder.stop();
  },
});

export { expect } from '@playwright/test';
