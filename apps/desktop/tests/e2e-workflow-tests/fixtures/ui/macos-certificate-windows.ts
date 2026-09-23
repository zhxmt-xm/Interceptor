import { execFile } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { expect } from '@playwright/test';

import { MacosWorkflowHostSafetyOperations } from '../safety/macos-workflow-host-safety-operations';

const execute = promisify(execFile);

export interface MacosCertificateWindow {
  readonly handle: string;
  readonly processId: number;
  readonly processStartedAt: string;
  readonly kind: 'reveal' | 'view';
  readonly certificateDirectory: string;
}

const windowIdentityScript = `
function attribute(element, name) {
  try { return element.attributes.byName(name).value(); } catch { return null; }
}
function identity(process, window) {
  const identifier = attribute(window, 'AXIdentifier');
  if (typeof identifier === 'string' && identifier.startsWith('com.zhxmt.interceptor.certificate.')) {
    return JSON.stringify([process.unixId(), identifier]);
  }
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
  const certificate = await readFile(path.join(canonicalDirectory, 'root-cert.pem'), 'utf8')
    .then((pem) => new X509Certificate(pem)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
  const viewerIdentifier = certificate
    ? `com.zhxmt.interceptor.certificate.${certificate.fingerprint256.replaceAll(':', '')}` : null;
  const { stdout: processTable } = await execute('/bin/ps', ['-axww', '-o', 'pid=,comm='], { encoding: 'utf8' });
  const viewerProcessIds = processTable.split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line);
    return match?.[2] === '/Library/PrivilegedHelperTools/com.zhxmt.interceptor.platform-capabilities'
      ? [Number(match[1])] : [];
  });
  const { stdout } = await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
${windowIdentityScript}
const events = Application('System Events');
const directory = ${JSON.stringify(canonicalDirectory)}.replace(/^\\/private(?=\\/(?:var|tmp)\\/)/, '');
function matchesDirectory(value) {
  if (typeof value !== 'string') return false;
  return decodeURIComponent(value).replace(/^file:\\/\\//, '').replace(/^\\/private(?=\\/(?:var|tmp)\\/)/, '').replace(/\\/$/, '') === directory;
}
const result = [];
for (const process of events.applicationProcesses.whose({ name: 'Finder' })()) {
  for (const window of process.windows()) {
    const matches = matchesDirectory(attribute(window, 'AXDocument'))
      || attribute(window, 'AXTitle') === 'certificates';
    if (matches) result.push({ handle: identity(process, window), processId: process.unixId(), kind: 'reveal' });
  }
}
if (${JSON.stringify(viewerIdentifier)} !== null) {
  for (const processId of ${JSON.stringify(viewerProcessIds)}) {
    for (const process of events.applicationProcesses.whose({ unixId: processId })()) {
      for (const window of process.windows()) {
        if (attribute(window, 'AXIdentifier') === ${JSON.stringify(viewerIdentifier)}) {
          result.push({ handle: identity(process, window), processId: process.unixId(), kind: 'view' });
        }
      }
    }
  }
}
JSON.stringify(result);
`], { encoding: 'utf8', timeout: 15_000 });
  const windows = JSON.parse(stdout) as Array<Omit<MacosCertificateWindow, 'processStartedAt' | 'certificateDirectory'>>;
  const matchedWindows: MacosCertificateWindow[] = [];
  for (const window of windows) {
    const current = await MacosWorkflowHostSafetyOperations.readProcessIdentity(window.processId);
    const candidate = { ...window, ...current, certificateDirectory: canonicalDirectory };
    if (window.kind === 'reveal' && !await finderSelectionMatches(candidate)) continue;
    if (window.kind === 'view') {
      const { stdout: executable } = await execute('/bin/ps', ['-ww', '-p', String(window.processId), '-o', 'comm='], { encoding: 'utf8' });
      if (executable.trim() !== '/Library/PrivilegedHelperTools/com.zhxmt.interceptor.platform-capabilities') continue;
    }
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
    const certificatePath = path.join(window.certificateDirectory, 'root-cert.pem');
    const copiedPath = selectedPath === `'${certificatePath}'` ? certificatePath : selectedPath;
    const canonicalPath = await realpath(copiedPath).catch(() => null);
    return canonicalPath === certificatePath;
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
  const current = await MacosWorkflowHostSafetyOperations.readProcessIdentity(window.processId)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ESRCH') return null;
      throw error;
    });
  if (!current) return;
  if (current.processStartedAt !== window.processStartedAt) throw new Error('Certificate window process generation changed.');
  await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
${windowIdentityScript}
const events = Application('System Events');
const processes = events.applicationProcesses.whose({ unixId: ${window.processId} })();
if (processes.length !== 1) throw new Error('Certificate window owner changed.');
const ownedApp = processes[0];
const matches = ownedApp.windows().filter(candidate => identity(ownedApp, candidate) === ${JSON.stringify(window.handle)});
if (matches.length > 1) throw new Error('Certificate window identity is ambiguous.');
if (matches.length === 1) {
  if (events.applicationProcesses.whose({ name: 'SecurityAgent' })().some(process => process.windows().length > 0)) {
    throw new Error('System confirmation is open; certificate window cleanup stopped.');
  }
  ownedApp.frontmost = true;
  matches[0].actions.byName('AXRaise').perform();
  ${window.kind === 'view' ? 'events.keyCode(36);' : `
  const closeButton = matches[0].buttons().find(button => attribute(button, 'AXSubrole') === 'AXCloseButton');
  if (!closeButton) throw new Error('Certificate Finder window has no native close button.');
  const position = closeButton.position();
  const size = closeButton.size();
  ownedApp.click({ at: [position[0] + size[0] / 2, position[1] + size[1] / 2] });
  `}
}
`], { encoding: 'utf8', timeout: 15_000 });
  await expect.poll(async () => {
    const { stdout } = await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
${windowIdentityScript}
const events = Application('System Events');
const processes = events.applicationProcesses.whose({ unixId: ${window.processId} })();
JSON.stringify(processes.some(process => process.windows().some(candidate =>
  identity(process, candidate) === ${JSON.stringify(window.handle)})));
`], { encoding: 'utf8', timeout: 5_000 });
    return JSON.parse(stdout) as boolean;
  }, { timeout: 10_000, message: 'The exact certificate window must disappear after Close.' }).toBe(false);
  if (window.kind === 'view') {
    await expect.poll(async () => {
      const owner = await MacosWorkflowHostSafetyOperations.readProcessIdentity(window.processId)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ESRCH') return null;
          throw error;
        });
      return owner?.processStartedAt === window.processStartedAt;
    }, { timeout: 10_000, message: 'The certificate viewer process must exit after Close.' }).toBe(false);
  }
}

export async function verifyAndCloseMacosCertificateWindow(
  kind: MacosCertificateWindow['kind'], before: readonly MacosCertificateWindow[], certificateDirectory: string,
  ownedWindows: MacosCertificateWindow[],
): Promise<void> {
  const previousHandles = new Set(before.map((window) => window.handle));
  let openedWindow: MacosCertificateWindow | undefined;
  await expect.poll(async () => {
    const windows = await listMacosCertificateWindows(certificateDirectory);
    openedWindow = windows.find((window) => window.kind === kind && !previousHandles.has(window.handle))
      ?? windows.find((window) => window.kind === kind);
    return openedWindow !== undefined;
  }, { timeout: 15_000, message: `Expected a native ${kind} window for this workflow's public certificate.` }).toBe(true);
  if (!previousHandles.has(openedWindow!.handle)) {
    ownedWindows.push(openedWindow!);
    await closeMacosCertificateWindow(openedWindow!);
  }
}