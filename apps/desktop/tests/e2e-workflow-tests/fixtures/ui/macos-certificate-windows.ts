import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { expect } from '@playwright/test';

import { MacosWorkflowHostSafetyOperations } from '../safety/macos-workflow-host-safety-operations';

const execute = promisify(execFile);

export interface MacosCertificateWindow {
  readonly handle: string;
  readonly processId: number;
  readonly processStartedAt: string;
  readonly kind: 'reveal';
  readonly certificateDirectory: string;
}

const windowIdentityScript = `
function attribute(element, name) {
  try { return element.attributes.byName(name).value(); } catch { return null; }
}
function identity(process, window) {
  return JSON.stringify([process.unixId(), attribute(window, 'AXIdentifier'),
    attribute(window, 'AXTitle'), attribute(window, 'AXDocument'), attribute(window, 'AXSubrole'),
    window.position(), window.size()]);
}
`;

export async function listMacosCertificateWindows(certificateDirectory: string): Promise<MacosCertificateWindow[]> {
  if (process.platform !== 'darwin') throw new Error('macOS certificate windows require macOS.');
  const canonicalDirectory = await realpath(certificateDirectory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return certificateDirectory;
    throw error;
  });
  const { stdout } = await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
${windowIdentityScript}
const events = Application('System Events');
const directory = ${JSON.stringify(canonicalDirectory)}.replace(/^\\/private(?=\\/(?:var|tmp)\\/)/, '');
function matchesDirectory(value) {
  if (typeof value !== 'string') return false;
  return decodeURIComponent(value).replace(/^file:\\/\\//, '').replace(/^\\/private(?=\\/(?:var|tmp)\\/)/, '').replace(/\\/$/, '') === directory;
}
function referencesCertificate(element, depth) {
  const values = ['AXTitle', 'AXDescription', 'AXValue', 'AXDocument', 'AXIdentifier'].map(name => attribute(element, name));
  if (values.some(value => typeof value === 'string' && /root-cert\\.(?:pem|cer)/.test(value))) return true;
  if (depth === 0) return false;
  return element.uiElements().some(child => {
    const role = attribute(child, 'AXRole');
    return ['AXGroup', 'AXSheet', 'AXStaticText', 'AXTextField', 'AXScrollArea', 'AXSplitGroup', 'AXList'].includes(role)
      && referencesCertificate(child, depth - 1);
  });
}
const result = [];
for (const process of events.applicationProcesses.whose({ name: 'Finder' })()) {
  for (const window of process.windows()) {
    const matches = matchesDirectory(attribute(window, 'AXDocument'))
      || (attribute(window, 'AXTitle') === 'certificates' && referencesCertificate(window, 8));
    if (matches) result.push({ handle: identity(process, window), processId: process.unixId(), kind: 'reveal' });
  }
}
JSON.stringify(result);
`], { encoding: 'utf8', timeout: 15_000 });
  const windows = JSON.parse(stdout) as Array<Omit<MacosCertificateWindow, 'processStartedAt' | 'certificateDirectory'>>;
  const matchedWindows: MacosCertificateWindow[] = [];
  for (const window of windows) {
    const current = await MacosWorkflowHostSafetyOperations.readProcessIdentity(window.processId);
    const candidate = { ...window, ...current, certificateDirectory: canonicalDirectory };
    if (!await finderSelectionMatches(candidate)) continue;
    matchedWindows.push(candidate);
  }
  return matchedWindows;
}

async function finderSelectionMatches(window: MacosCertificateWindow): Promise<boolean> {
  const originalClipboard = (await execute('/usr/bin/pbpaste', [], { encoding: 'utf8' })).stdout;
  try {
    await writeClipboard('');
    await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
${windowIdentityScript}
const events = Application('System Events');
const ownedApp = events.applicationProcesses.whose({ unixId: ${window.processId} })()[0];
const matches = ownedApp.windows().filter(candidate => identity(ownedApp, candidate) === ${JSON.stringify(window.handle)});
if (matches.length !== 1) throw new Error('Finder certificate window identity changed.');
ownedApp.frontmost = true;
matches[0].actions.byName('AXRaise').perform();
events.keyCode(8, { using: ['command down', 'option down'] });
`], { encoding: 'utf8', timeout: 10_000 });
    const selectedPath = (await execute('/usr/bin/pbpaste', [], { encoding: 'utf8' })).stdout.trim();
    const canonicalPath = await realpath(selectedPath).catch(() => null);
    return canonicalPath === path.join(window.certificateDirectory, 'root-cert.pem');
  } finally {
    await writeClipboard(originalClipboard);
  }
}

async function writeClipboard(value: string): Promise<void> {
  const execution = execute('/usr/bin/pbcopy', [], { encoding: 'utf8' });
  execution.child.stdin?.end(value);
  await execution;
}

export async function closeMacosCertificateWindow(window: MacosCertificateWindow): Promise<void> {
  const current = await MacosWorkflowHostSafetyOperations.readProcessIdentity(window.processId);
  if (current.processStartedAt !== window.processStartedAt) throw new Error('Certificate window process generation changed.');
  await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
${windowIdentityScript}
const events = Application('System Events');
if (events.applicationProcesses.whose({ name: 'SecurityAgent' })().some(process => process.windows().length > 0)) {
  throw new Error('System confirmation is open; certificate window cleanup stopped.');
}
const processes = events.applicationProcesses.whose({ unixId: ${window.processId} })();
if (processes.length !== 1) throw new Error('Certificate window owner changed.');
const ownedApp = processes[0];
const matches = ownedApp.windows().filter(candidate => identity(ownedApp, candidate) === ${JSON.stringify(window.handle)});
if (matches.length !== 1) throw new Error('Certificate window identity is ambiguous or changed.');
ownedApp.frontmost = true;
matches[0].actions.byName('AXRaise').perform();
events.keyCode(13, { using: ['command down'] });
`], { encoding: 'utf8', timeout: 15_000 });
  await expect.poll(async () => (await listMacosCertificateWindows(window.certificateDirectory))
    .some((candidate) => candidate.handle === window.handle), { timeout: 10_000 }).toBe(false);
}

export async function verifyAndCloseMacosCertificateWindow(
  kind: MacosCertificateWindow['kind'], before: readonly MacosCertificateWindow[], certificateDirectory: string,
  ownedWindows: MacosCertificateWindow[],
): Promise<void> {
  const previousHandles = new Set(before.map((window) => window.handle));
  let openedWindow: MacosCertificateWindow | undefined;
  await expect.poll(async () => {
    openedWindow = (await listMacosCertificateWindows(certificateDirectory))
      .find((window) => window.kind === kind && !previousHandles.has(window.handle));
    return openedWindow !== undefined;
  }, { timeout: 15_000, message: `Expected a native ${kind} window for this workflow's public certificate.` }).toBe(true);
  ownedWindows.push(openedWindow!);
  await closeMacosCertificateWindow(openedWindow!);
}