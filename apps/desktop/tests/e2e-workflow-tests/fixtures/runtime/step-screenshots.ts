import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { test as playwrightTest, type TestInfo } from '@playwright/test';

import type { LocalElectronApplicationDriver } from './local-electron-driver';
import { MacosWorkflowHostSafetyOperations } from '../safety/macos-workflow-host-safety-operations';
import { macosFileDialogWindowId, showMacosFileDialogList } from '../ui/macos-file-dialog';
import { screenshotWindowsFileDialog } from '../ui/windows-file-dialog';
import {
  annotateScreenshot, readStableHighlightGeometry, verifyHighlightGeometry,
  type AnnotatedScreenshot, type HighlightGeometry, type ScreenshotHighlight,
} from './screenshot-highlights';

const execute = promisify(execFile);

export interface StepScreenshotOptions {
  stepScreenshots: boolean;
}

interface StepImage {
  readonly id: string;
  readonly title: string;
  readonly image: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly window: 'app' | 'native-dialog';
  readonly language: string;
  readonly theme: string;
  readonly captureDurationMs: number;
  readonly annotated?: AnnotatedScreenshot;
}

interface ScreenshotStepOptions {
  readonly highlights?: readonly ScreenshotHighlight[];
}

interface ScreenshotRun {
  driver: LocalElectronApplicationDriver | undefined;
  hostRestored: boolean;
  overheadMs: number;
  readonly steps: StepImage[];
  readonly directory: string;
  readonly workflowSha256: string;
  readonly examples: Record<string, string>;
}

const runs = new WeakMap<TestInfo, ScreenshotRun>();
const screenshotTools = new Map<string, Promise<string>>();

/** Enable evidence for this test only; ordinary workflows create no screenshot artifacts. */
export function startStepScreenshots(testInfo: TestInfo, enabled: boolean): void {
  if (!enabled) return;
  runs.set(testInfo, {
    driver: undefined,
    hostRestored: false,
    overheadMs: 0,
    steps: [],
    directory: testInfo.outputPath('step-screenshots'),
    workflowSha256: createHash('sha256').update(readFileSync(testInfo.file)).digest('hex'),
    examples: {},
  });
}

/** Follow actual App generations without restoring or injecting their business state. */
export function useScreenshotDriver(testInfo: TestInfo, driver: LocalElectronApplicationDriver): void {
  const run = runs.get(testInfo);
  if (run) run.driver = driver;
}

/** Keep the actual guard result separate from the overall test outcome. */
export function recordScreenshotHostRestoration(testInfo: TestInfo, restored: boolean): void {
  const run = runs.get(testInfo);
  if (run) run.hostRestored = restored;
}

/** Bind a public, test-owned loopback address without persisting credentials or query values. */
export function recordScreenshotExample(key: string, address: string): void {
  const run = runs.get(playwrightTest.info());
  if (!run) return;
  const url = new URL(address);
  if (!/^[a-z][a-z0-9-]*$/.test(key)
    || !['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || url.username || url.password) {
    throw new Error(`Screenshot example ${key} must be a test-owned loopback URL without credentials.`);
  }
  const value = `${url.protocol}//${url.host}${url.pathname}`;
  if (run.examples[key] !== undefined && run.examples[key] !== value) {
    throw new Error(`Screenshot example ${key} changed identity; use separate keys for independent endpoints.`);
  }
  run.examples[key] = value;
}

/** Mark a completed user-operation step after its existing business assertions. */
export async function screenshotStep(title: string, options: ScreenshotStepOptions = {}): Promise<void> {
  const testInfo = playwrightTest.info();
  const run = runs.get(testInfo);
  if (!run) return;
  await captureMeasuredStep(testInfo, run, title, async () => {
    await captureStep(testInfo, run, title, 'app', options);
  });
}

/** Native helpers call this only after navigating to the workflow-owned file location. */
export async function screenshotNativeDialog(title: string): Promise<void> {
  const testInfo = playwrightTest.info();
  const run = runs.get(testInfo);
  if (!run) return;
  await captureMeasuredStep(testInfo, run, title, async () => {
    if (process.platform === 'darwin' && run.driver) {
      await showMacosFileDialogList(run.driver.nativeFileDialogOwner());
    }
    await captureStep(testInfo, run, title, 'native-dialog');
  });
}

/** Account for optional capture work separately while retaining the workflow's business timeout. */
async function captureMeasuredStep(
  testInfo: TestInfo, run: ScreenshotRun, title: string, capture: () => Promise<void>,
): Promise<void> {
  const timeout = testInfo.timeout;
  const captureTimeout = 150_000;
  const startedAt = performance.now();
  if (timeout !== 0) testInfo.setTimeout(timeout + captureTimeout);
  try {
    await playwrightTest.step(title, capture, { timeout: captureTimeout });
  } finally {
    const elapsed = Math.ceil(performance.now() - startedAt);
    run.overheadMs += elapsed;
    if (timeout !== 0) testInfo.setTimeout(timeout + elapsed);
  }
}

async function captureStep(
  testInfo: TestInfo, run: ScreenshotRun, title: string, window: StepImage['window'],
  options: ScreenshotStepOptions = {},
): Promise<void> {
  const captureStartedAt = performance.now();
  const driver = run.driver;
  if (!driver || driver.page.isClosed()) {
    throw new Error('A screenshot step requires the workflow-owned, live App window.');
  }
  const language = await driver.page.locator('html').getAttribute('lang');
  const theme = await driver.page.locator('html').getAttribute('data-theme');
  if (!language || !theme) throw new Error('The App omitted its actual language or theme.');
  const id = `step-${String(run.steps.length + 1).padStart(3, '0')}`;
  const image = `${id}.png`;
  const destination = path.join(run.directory, image);
  const highlights = options.highlights ?? [];
  let geometry: HighlightGeometry | undefined;
  await mkdir(run.directory, { recursive: true });
  if (process.platform === 'darwin') {
    await MacosWorkflowHostSafetyOperations.assertDesktopUnlocked();
    const owner = driver.nativeFileDialogOwner();
    const identity = await MacosWorkflowHostSafetyOperations.readProcessIdentity(owner.processId);
    if (identity.processStartedAt !== owner.processStartedAt) {
      throw new Error('The screenshot owner changed process generation.');
    }
    let windowId: number;
    if (window === 'native-dialog') {
      windowId = await macosFileDialogWindowId(owner);
    } else {
      const size = await driver.page.evaluate(() => ({
        width: outerWidth, height: outerHeight,
      }));
      const { stdout } = await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
ObjC.import("CoreGraphics");
const windows = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(0, 0)));
const matches = windows.filter(window => window.kCGWindowOwnerPID === ${owner.processId}
  && window.kCGWindowLayer === 0
  && Math.abs(window.kCGWindowBounds.Width - ${size.width}) < 1
  && Math.abs(window.kCGWindowBounds.Height - ${size.height}) < 1);
if (matches.length !== 1) throw new Error("Expected one workflow-owned App window.");
JSON.stringify(matches[0].kCGWindowNumber);
`], { encoding: 'utf8', timeout: 10_000 });
      const value: unknown = JSON.parse(stdout);
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new Error('The native screenshot lookup omitted its window ID.');
      }
      windowId = value;
    }
    const tool = await prepareScreenshotTool(testInfo);
    if (highlights.length) geometry = await readStableHighlightGeometry(driver.page, highlights);
    await execute(tool, [String(owner.processId), String(windowId), destination], {
      timeout: 30_000, encoding: 'utf8',
    });
  } else if (process.platform === 'win32' && window === 'native-dialog') {
    await screenshotWindowsFileDialog(driver.nativeFileDialogOwner(), destination);
  } else {
    if (window === 'native-dialog') {
      throw new Error('Native file-panel screenshots are not implemented on this platform.');
    }
    if (highlights.length) geometry = await readStableHighlightGeometry(driver.page, highlights);
    await driver.page.screenshot({ path: destination, type: 'png' });
  }
  const bytes = await readFile(destination);
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('The step screenshot is not a PNG.');
  }
  let annotated: AnnotatedScreenshot | undefined;
  if (geometry) {
    await verifyHighlightGeometry(driver.page, highlights, geometry);
    const annotatedImage = `${id}.annotated.png`;
    const annotatedPath = path.join(run.directory, annotatedImage);
    annotated = await annotateScreenshot(destination, annotatedPath, annotatedImage, geometry);
    await testInfo.attach(`${id}-annotated`, { path: annotatedPath, contentType: 'image/png' });
  }
  run.steps.push({
    id, title, image, window, language, theme,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    captureDurationMs: Math.round(performance.now() - captureStartedAt),
    ...(annotated ? { annotated } : {}),
  });
  await testInfo.attach(id, { path: destination, contentType: 'image/png' });
}

async function prepareScreenshotTool(testInfo: TestInfo): Promise<string> {
  const directory = path.join(testInfo.project.outputDir, '.screenshot-tools');
  const cached = screenshotTools.get(directory);
  if (cached) return cached;
  const prepared = (async () => {
    await mkdir(directory, { recursive: true });
    const source = path.resolve(__dirname, '../ui/window-screenshot.swift');
    const destination = path.join(directory, 'window-screenshot');
    await execute('/usr/bin/xcrun', ['swiftc', '-parse-as-library', source, '-o', destination], {
      timeout: 120_000, encoding: 'utf8',
    });
    return destination;
  })();
  screenshotTools.set(directory, prepared);
  return prepared;
}

/** Finalize only after the same test's real App teardown and host guard have finished. */
export async function finishStepScreenshots(testInfo: TestInfo): Promise<void> {
  const run = runs.get(testInfo);
  if (!run) return;
  try {
    await mkdir(run.directory, { recursive: true });
    const appPath = process.env.INTERCEPTOR_E2E_MACOS_APP_PATH;
    let appVersion: string;
    if (process.platform === 'darwin' && appPath) {
      const { stdout } = await execute('/usr/libexec/PlistBuddy', [
        '-c', 'Print :CFBundleShortVersionString', path.join(appPath, 'Contents/Info.plist'),
      ], { encoding: 'utf8' });
      appVersion = stdout.trim();
    } else {
      const manifest: unknown = JSON.parse(await readFile(path.resolve(__dirname, '../../../../package.json'), 'utf8'));
      if (typeof manifest !== 'object' || manifest === null
        || !('version' in manifest) || typeof manifest.version !== 'string') {
        throw new Error('The App package omitted its version.');
      }
      appVersion = manifest.version;
    }
    if (createHash('sha256').update(await readFile(testInfo.file)).digest('hex') !== run.workflowSha256) {
      throw new Error('The workflow source changed during screenshot capture.');
    }
    const passed = testInfo.status === 'passed' && run.hostRestored;
    const manifest = {
      schemaVersion: 1,
      workflow: path.relative(path.resolve(__dirname, '../../workflows'), testInfo.file).split(path.sep).join('/'),
      test: testInfo.title,
      appVersion, platform: process.platform,
      status: passed ? 'passed' : 'failed',
      hostRestored: run.hostRestored,
      screenshotOverheadMs: run.overheadMs,
      workflowSha256: run.workflowSha256,
      examples: run.examples,
      steps: run.steps,
    };
    const file = path.join(run.directory, 'manifest.json');
    await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await testInfo.attach('step-screenshots', { path: file, contentType: 'application/json' });
  } finally {
    runs.delete(testInfo);
  }
}
