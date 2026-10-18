import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { expect, test, type TestInfo } from '@playwright/test';

import type { LocalElectronApplicationDriver } from '../runtime/local-electron-driver';
import { MacosWorkflowHostSafetyOperations } from '../safety/macos-workflow-host-safety-operations';
import { macosFileDialogWindowId, showMacosFileDialogList } from './macos-file-dialog';

const execFileAsync = promisify(execFile);

interface GuideStep {
  readonly id: string;
  readonly title: string;
  readonly image: string;
  readonly seconds: number;
}

/** Records only the workflow-owned native App window, with a screenshot for each real action. */
export class GuidebookMedia {
  private readonly steps: GuideStep[] = [];
  private startedAt = performance.now();
  private readonly recording: ChildProcess;
  private readonly recordingExit: Promise<unknown[]>;
  private recordingErrors = '';
  private recordingProgress = '';
  private recordingReady = false;
  private nextWindowRequest = 0;
  private recordingInputError: Error | null = null;

  private constructor(
    private readonly desktopApp: LocalElectronApplicationDriver,
    private readonly testInfo: TestInfo,
    private readonly chapter: string,
    readonly windowId: number,
  ) {
    const recorder = process.env.INTERCEPTOR_GUIDE_RECORDER;
    if (!recorder) throw new Error('Set INTERCEPTOR_GUIDE_RECORDER to the compiled native window recorder.');
    this.recording = spawn(recorder, [
      String(windowId), testInfo.outputPath(`${chapter}-raw.mp4`),
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.recording.stdin?.on('error', (error: Error) => { this.recordingInputError = error; });
    this.recording.stdout?.on('data', (data: Buffer) => {
      this.recordingProgress += data.toString('utf8');
      if (!this.recordingReady && this.recordingProgress.includes('recording-started')) {
        this.startedAt = performance.now();
        this.recordingReady = true;
      }
    });
    this.recording.stderr?.on('data', (data: Buffer) => {
      this.recordingErrors += data.toString('utf8');
    });
    this.recordingExit = once(this.recording, 'exit');
  }

  static async start(
    desktopApp: LocalElectronApplicationDriver,
    testInfo: TestInfo,
    chapter: string,
  ): Promise<GuidebookMedia> {
    if (process.platform !== 'darwin') throw new Error('Native guide recording currently requires macOS.');
    await MacosWorkflowHostSafetyOperations.assertDesktopUnlocked();
    if (!process.env.INTERCEPTOR_GUIDE_FFMPEG) throw new Error('Set INTERCEPTOR_GUIDE_FFMPEG to an installed FFmpeg executable.');
    desktopApp.page.setDefaultTimeout(15_000);
    const owner = desktopApp.nativeFileDialogOwner();
    const bounds = await desktopApp.page.evaluate(() => ({ width: window.outerWidth, height: window.outerHeight }));
    const { stdout } = await execFileAsync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
ObjC.import("CoreGraphics");
const windows = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(0, 0)));
const owned = windows.filter(window => window.kCGWindowOwnerPID === ${owner.processId}
  && window.kCGWindowLayer === 0
  && Math.abs(window.kCGWindowBounds.Width - ${bounds.width}) < 1
  && Math.abs(window.kCGWindowBounds.Height - ${bounds.height}) < 1);
if (owned.length !== 1) throw new Error("Expected exactly one workflow-owned App window: " + JSON.stringify(owned.map(window => ({
  id: window.kCGWindowNumber, name: window.kCGWindowName, alpha: window.kCGWindowAlpha,
  onScreen: window.kCGWindowIsOnscreen, sharing: window.kCGWindowSharingState, bounds: window.kCGWindowBounds
}))));
JSON.stringify({ windowId: owned[0].kCGWindowNumber });
`], { encoding: 'utf8', timeout: 10_000 });
    const value: unknown = JSON.parse(stdout);
    if (typeof value !== 'object' || value === null || !('windowId' in value)
      || typeof value.windowId !== 'number' || !Number.isInteger(value.windowId)) {
      throw new Error('Native App window inspection did not return a window ID.');
    }
    const recorder = new GuidebookMedia(desktopApp, testInfo, chapter, value.windowId);
    try {
      await once(recorder.recording, 'spawn');
      await expect.poll(async () => {
        if (recorder.recording.exitCode !== null || recorder.recording.signalCode !== null) {
          throw new Error(`Native recording exited early (${recorder.recording.exitCode ?? recorder.recording.signalCode}): ${recorder.recordingErrors}`);
        }
        return recorder.recordingReady;
      }, { timeout: 20_000, message: 'The native recorder must confirm its first recording frame.' }).toBe(true);
    } catch (error) {
      recorder.recording.kill('SIGINT');
      try { await recorder.recordingExit; }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Recording startup and shutdown failed.'); }
      await writeFile(testInfo.outputPath(`${chapter}-recording-startup.log`),
        `${recorder.recordingProgress}\n${recorder.recordingErrors}`, 'utf8');
      throw new AggregateError([error],
        `Native recording was not ready. Progress: ${recorder.recordingProgress.trim()}; error: ${recorder.recordingErrors.trim()}`);
    }
    return recorder;
  }

  async step(id: string, title: string, action: () => Promise<void>): Promise<void> {
    await this.captureStep(id, title, action, this.windowId);
  }

  /** Capture a real short-lived progress state without delaying the next user action. */
  async transientStep(id: string, title: string, action: () => Promise<void>): Promise<void> {
    await this.captureStep(id, title, action, this.windowId, 0);
  }

  async nativeDialogStep(id: string, title: string): Promise<void> {
    await showMacosFileDialogList(this.desktopApp.nativeFileDialogOwner());
    const windowId = await macosFileDialogWindowId(this.desktopApp.nativeFileDialogOwner());
    await this.selectRecordingWindow(windowId);
    try {
      await this.captureStep(id, title, async () => {}, windowId);
    } finally {
      await this.selectRecordingWindow(this.windowId);
    }
  }

  private async selectRecordingWindow(windowId: number): Promise<void> {
    const sequence = ++this.nextWindowRequest;
    await this.sendRecorderCommand(`window ${windowId} ${sequence}\n`, `window-ready:${sequence}\n`);
  }

  private async sendRecorderCommand(command: string, acknowledgement: string): Promise<void> {
    if (!this.recording.stdin) throw new Error('Native recorder control input is unavailable.');
    this.recording.stdin.write(command);
    await expect.poll(() => {
      if (this.recordingInputError) throw this.recordingInputError;
      if (this.recording.exitCode !== null || this.recording.signalCode !== null) {
        throw new Error(`Native recorder stopped (${this.recording.exitCode ?? this.recording.signalCode}): ${this.recordingProgress}\n${this.recordingErrors}`);
      }
      return this.recordingProgress.includes(acknowledgement);
    }, { timeout: 10_000 }).toBe(true);
  }

  private async captureStep(
    id: string, title: string, action: () => Promise<void>, windowId: number, readingPauseMs = 2500,
  ): Promise<void> {
    if (this.steps.some(step => step.id === id)) throw new Error(`Duplicate tutorial step: ${id}`);
    if (this.recording.exitCode !== null || this.recording.signalCode !== null) {
      throw new Error(`Recording stopped (${this.recording.exitCode ?? this.recording.signalCode}): ${this.recordingProgress}\n${this.recordingErrors}`);
    }
    await MacosWorkflowHostSafetyOperations.assertDesktopUnlocked();
    const seconds = (performance.now() - this.startedAt) / 1000;
    await test.step(title, action);
    // A deliberate reading pause is part of the video, not a substitute for product assertions.
    if (readingPauseMs > 0) await this.desktopApp.page.waitForTimeout(readingPauseMs);
    await MacosWorkflowHostSafetyOperations.assertDesktopUnlocked();
    const image = `${this.chapter}-${id}.png`;
    const sequence = ++this.nextWindowRequest;
    const destination = Buffer.from(this.testInfo.outputPath(image), 'utf8').toString('base64');
    await this.sendRecorderCommand(`snapshot ${windowId} ${sequence} ${destination}\n`, `snapshot-ready:${sequence}\n`);
    expect((await stat(this.testInfo.outputPath(image))).size).toBeGreaterThan(1000);
    this.steps.push({ id, title, image, seconds });
  }

  async stop(example: Readonly<Record<string, string>>): Promise<void> {
    const duration = (performance.now() - this.startedAt) / 1000;
    this.recording.kill('SIGINT');
    const [code, signal] = await this.recordingExit;
    if (code !== 0) throw new Error(`Native recorder did not finish cleanly (${code ?? signal}): ${this.recordingErrors}`);
    const ffmpeg = process.env.INTERCEPTOR_GUIDE_FFMPEG;
    if (!ffmpeg) throw new Error('Set INTERCEPTOR_GUIDE_FFMPEG to an installed FFmpeg executable.');
    const input = this.testInfo.outputPath(`${this.chapter}-raw.mp4`);
    const video = this.testInfo.outputPath(`${this.chapter}.mp4`);
    // ScreenCaptureKit omits unchanged trailing frames; retain the recorded reading pause.
    await execFileAsync(ffmpeg, [
      '-y', '-i', input, '-an', '-vf', 'scale=1600:-2,tpad=stop_mode=clone:stop=-1',
      '-r', '20', '-t', duration.toFixed(3),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '26', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', video,
    ], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 120_000 });
    const size = (await stat(video)).size;
    if (size >= 25 * 1024 * 1024) throw new Error('Tutorial video exceeds the free static asset size limit.');
    const language = await this.desktopApp.page.locator('html').getAttribute('lang');
    const metadata = {
      chapter: this.chapter, platform: process.platform, language,
      productPath: process.env.INTERCEPTOR_E2E_MACOS_APP_PATH ?? 'unpackaged production bundle',
      example, steps: this.steps, duration, video: path.basename(video), videoBytes: size,
      actualNativeWindow: true,
    };
    await writeFile(this.testInfo.outputPath(`${this.chapter}-steps.json`), JSON.stringify(metadata, null, 2), 'utf8');
    await this.testInfo.attach(`${this.chapter}-steps`, {
      body: await readFile(this.testInfo.outputPath(`${this.chapter}-steps.json`)), contentType: 'application/json',
    });
    const timestamp = (seconds: number): string => {
      const total = Math.round(seconds * 1000);
      const hours = Math.floor(total / 3_600_000);
      const minutes = Math.floor(total / 60_000) % 60;
      const remainder = Math.floor(total / 1000) % 60;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}.${String(total % 1000).padStart(3, '0')}`;
    };
    const captions = this.steps.map((step, index) =>
      `${index + 1}\n${timestamp(step.seconds)} --> ${timestamp(this.steps[index + 1]?.seconds ?? duration)}\n${step.title}\n`);
    await writeFile(this.testInfo.outputPath(`${this.chapter}.vtt`), `WEBVTT\n\n${captions.join('\n')}`, 'utf8');
  }
}
