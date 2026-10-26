import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { glob, lstat, readFile, readlink, realpath } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { extractFile } from '@electron/asar';

export const root = path.resolve(import.meta.dirname, '..');
export const desktop = path.join(root, 'apps/desktop');
export const workflowRoot = path.join(desktop, 'tests/e2e-workflow-tests/workflows');
export const planFile = 'guidebook/screenshot-publication.json';
export const dimensionFile = 'guidebook/media/image-dimensions.json';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
export const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function check(condition, message) {
  if (!condition) throw new Error(message);
}

export function captureCommand(cwd, executable, args) {
  try {
    return execFileSync(executable, args, {
      cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    }).trimEnd();
  } catch (error) {
    throw new Error(`${executable} failed: ${String(error.stderr ?? error.message).trim()}`, { cause: error });
  }
}

export function runCommand(cwd, executable, args, environment = {}) {
  const env = { ...process.env, ...environment };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(executable, args, { cwd, stdio: 'inherit', env, windowsHide: true });
  if (result.error) throw result.error;
  check(result.status === 0, `${executable} failed (${result.signal ?? result.status}); publication stopped.`);
}

export function relativeFile(file) {
  check(typeof file === 'string' && !file.includes('\\') && !file.includes('\0')
    && !path.posix.isAbsolute(file) && !/^[a-z]:/i.test(file)
    && file.split('/').every(part => part && part !== '.' && part !== '..'), `Unsafe publication path: ${file}`);
  return file;
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function checkFields(object, fields, name) {
  check(object && typeof object === 'object' && !Array.isArray(object)
    && Object.keys(object).every(key => fields.includes(key)), `Unsupported fields: ${name}`);
}

export function parsePublicationPlan(plan) {
  check(plan.schemaVersion === 2, 'Unsupported Homepage publication contract.');
  checkFields(plan, ['schemaVersion', 'appVersion', 'locale', 'workflows', 'retainedMedia'], 'publication');
  check(plan.locale === 'en-US' && typeof plan.appVersion === 'string' && plan.appVersion.length > 0,
    'Invalid App publication identity.');
  check(Array.isArray(plan.workflows) && plan.workflows.length > 0,
    'The screenshot publication contract is empty.');
  const destinations = new Set();
  const directoryOwners = new Map();
  const identities = new Set();
  for (const workflow of plan.workflows) {
    checkFields(workflow, ['file', 'testName', 'workflowSha256', 'steps', 'examples'], 'workflow');
    relativeFile(workflow.file);
    check(workflow.file.endsWith('.workflow.ts') && typeof workflow.testName === 'string'
      && workflow.testName.length > 0, `Invalid test: ${workflow.file}`);
    const identity = JSON.stringify([workflow.file, workflow.testName]);
    check(!identities.has(identity), `Duplicate workflow test: ${identity}`);
    identities.add(identity);
    check(/^[a-f0-9]{64}$/.test(workflow.workflowSha256), `Invalid workflow digest: ${workflow.file}`);
    check(Array.isArray(workflow.steps) && workflow.steps.length > 0, `Missing steps: ${workflow.file}`);
    for (const [index, step] of workflow.steps.entries()) {
      const name = `${workflow.file}/${workflow.testName}/step ${index + 1}`;
      checkFields(step, ['title', 'window', 'theme', 'image'], name);
      check(typeof step.title === 'string' && step.title.length > 0 && ['app', 'native-dialog'].includes(step.window)
        && ['light', 'dark', 'warm', 'ember'].includes(step.theme), `Invalid step state: ${name}`);
      checkFields(step.image, ['target', 'rawTarget', 'labels'], `${name}/image`);
      check(Array.isArray(step.image.labels) && new Set(step.image.labels).size === step.image.labels.length
        && step.image.labels.every(label => typeof label === 'string' && /^[1-9]\d*$/.test(label)), `Invalid highlight labels: ${name}`);
      if (step.image.target === null) {
        check(step.image.rawTarget === undefined, `Unpublished step has destinations: ${name}`);
        continue;
      }
      const image = step.image;
      relativeFile(image.target);
      relativeFile(image.rawTarget);
      const directory = path.posix.dirname(image.target);
      check(directory.startsWith('guidebook/media/') && directory === path.posix.dirname(image.rawTarget)
        && /^[\w.-]+\.png$/.test(path.posix.basename(image.target))
        && /^[\w.-]+\.png$/.test(path.posix.basename(image.rawTarget)), `Invalid image destination: ${name}`);
      check(!directoryOwners.has(directory) || directoryOwners.get(directory) === workflow,
        `Media directory belongs to multiple tests: ${directory}`);
      directoryOwners.set(directory, workflow);
      for (const file of new Set([image.target, image.rawTarget])) {
        check(!destinations.has(file), `Duplicate image destination: ${file}`);
        destinations.add(file);
      }
    }
    check(Array.isArray(workflow.examples), `Missing explicit example bindings: ${workflow.file}`);
    for (const example of workflow.examples) {
      checkFields(example, ['name', 'port', 'documents'], `${workflow.file}/example`);
      const name = `${workflow.file}/${example.name}`;
      check(typeof example.name === 'string' && /^[a-z][a-z0-9-]*$/.test(example.name)
        && typeof example.port === 'string' && /^[1-9]\d{0,4}$/.test(example.port)
        && Number(example.port) <= 65535, `Invalid example: ${name}`);
      check(Array.isArray(example.documents) && example.documents.length > 0, `Unbound example: ${name}`);
      for (const document of example.documents) {
        checkFields(document, ['file', 'regions'], `${name}/document`);
        check(/^guidebook\/(?:zh-CN|en)\/[\w-]+\.md$/.test(document.file)
          && Array.isArray(document.regions) && document.regions.length > 0, `Invalid example document: ${name}`);
        for (const region of document.regions) checkFields(region, ['anchor', 'occurrences'], `${name}/region`);
        check(document.regions.every(region => (region.anchor === null || typeof region.anchor === 'string')
          && Number.isInteger(region.occurrences) && region.occurrences > 0)
          && new Set(document.regions.map(region => region.anchor)).size === document.regions.length,
        `Invalid anchored example counts: ${name}`);
      }
    }
  }
  check(destinations.size > 0, 'The screenshot publication contract has no image destinations.');
  if (plan.retainedMedia !== undefined) {
    check(Array.isArray(plan.retainedMedia), 'Invalid retained media list.');
    const directories = new Set(directoryOwners.keys());
    for (const group of plan.retainedMedia) {
      checkFields(group, ['manifest', 'manifestSha256'], 'retained media');
      relativeFile(group.manifest);
      const directory = path.posix.dirname(group.manifest);
      check(group.manifest.startsWith('guidebook/media/') && path.posix.basename(group.manifest) === 'manifest.json'
        && ![...directories].some(existing => existing === directory
          || existing.startsWith(`${directory}/`) || directory.startsWith(`${existing}/`)),
      `Duplicate or invalid retained media directory: ${directory}`);
      check(/^[a-f0-9]{64}$/.test(group.manifestSha256),
        `Missing reviewed media manifest digest: ${group.manifest}`);
      directories.add(directory);
    }
  }
  return { plan, destinations, mediaDirectories: new Set(directoryOwners.keys()) };
}

export function documentRegions(text) {
  const anchors = [...text.matchAll(/<a id="([^"]+)"><\/a>/g)];
  const regions = new Map([[null, { start: 0, end: anchors[0]?.index ?? text.length }]]);
  for (const [index, anchor] of anchors.entries()) {
    check(!regions.has(anchor[1]), `Duplicate document anchor: ${anchor[1]}`);
    regions.set(anchor[1], { start: anchor.index + anchor[0].length, end: anchors[index + 1]?.index ?? text.length });
  }
  return regions;
}

export function verifyDiscoveredTests(plan) {
  check(process.env.npm_execpath, 'Use npm start to run the publisher.');
  const listing = JSON.parse(captureCommand(desktop, process.execPath, [
    process.env.npm_execpath, 'exec', '--no', '--', 'playwright', 'test',
    '--config', 'tests/e2e-workflow-tests/playwright.config.ts', '--list', '--reporter=json',
  ]));
  const discovered = [];
  const visit = suite => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) discovered.push({ title: spec.title, file: spec.file.replaceAll('\\', '/'), project: test.projectName });
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of listing.suites ?? []) visit(suite);
  const projects = new Map();
  for (const workflow of plan.workflows) {
    const matches = discovered.filter(test => test.title === workflow.testName
      && (test.file === workflow.file || test.file.endsWith(`/${workflow.file}`)));
    check(matches.length === 1,
    `Registered test is missing or ambiguous: ${workflow.file}/${workflow.testName}`);
    projects.set(workflow, matches[0].project);
  }
  return projects;
}

async function verifyImage(directory, image) {
  check(/^[\w.-]+\.png$/.test(image.image), 'Unsafe screenshot filename.');
  const file = path.join(directory, image.image);
  const info = await lstat(file);
  check(info.isFile() && !info.isSymbolicLink() && await realpath(file) === file, `Not a regular screenshot file: ${file}`);
  const bytes = await readFile(file);
  check(bytes.length >= 24 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
    && bytes.length === image.bytes && digest(bytes) === image.sha256, `Invalid screenshot bytes: ${file}`);
  return { file, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length, sha256: image.sha256 };
}

export async function verifyWorkflowRun(output, workflow, plan, application) {
  const name = `${workflow.file}/${workflow.testName}`;
  const manifests = [];
  for await (const relative of glob('**/step-screenshots/manifest.json', { cwd: output })) manifests.push(path.join(output, relative));
  check(manifests.length === 1, `Expected one complete manifest for ${name}, found ${manifests.length}.`);
  const bytes = await readFile(manifests[0]);
  const manifest = JSON.parse(bytes.toString('utf8'));
  check(manifest.workflow === workflow.file && manifest.test === workflow.testName
    && manifest.workflowSha256 === workflow.workflowSha256, `Executed test differs from its contract: ${name}`);
  check(manifest.status === 'passed' && manifest.hostRestored === true
    && manifest.appVersion === plan.appVersion && manifest.platform === application.platform, `Incomplete or incompatible run: ${name}`);
  const directory = path.dirname(manifests[0]);
  const generations = [];
  for await (const file of glob('{metadata.json,*-metadata.json}', { cwd: path.dirname(directory) })) {
    const data = await readFile(path.join(path.dirname(directory), file));
    const metadata = JSON.parse(data.toString('utf8'));
    check(metadata.target === application.target && metadata.platform === application.platform
      && metadata.architecture === application.architecture && metadata.gracefulDestroyVerified === true,
    `App generation did not exit normally: ${name}/${file}`);
    generations.push({ file, sha256: digest(data) });
  }
  check(generations.length > 0 && manifest.steps.length === workflow.steps.length, `Missing exit evidence or changed screenshot sequence: ${name}`);
  const images = [];
  for (const [index, expected] of workflow.steps.entries()) {
    const step = manifest.steps[index];
    check(step.language === 'en' && step.title === expected.title && step.window === expected.window
      && step.theme === expected.theme
      && same((step.annotated?.highlights ?? []).map(highlight => highlight.label), expected.image.labels),
    `Step ${index + 1} changed: ${name}. Review the step and its image destinations.`);
    const raw = await verifyImage(directory, step);
    const annotated = step.annotated ? await verifyImage(directory, step.annotated) : undefined;
    check(raw.width > 0 && raw.height > 0 && same([raw.width, raw.height], [step.width, step.height])
      && (!annotated || (annotated.width === raw.width && annotated.height === raw.height)), `PNG size differs: ${name}/step ${index + 1}`);
    images.push({ step, raw, annotated });
  }
  return { manifest, manifestSha256: digest(bytes), images, generations, application };
}

export async function assertHostAvailable() {
  const listing = process.platform === 'win32'
    ? captureCommand(root, 'powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Get-CimInstance Win32_Process | Where-Object { $_.Name -in @("electron.exe", "Interceptor.exe", "node.exe") } | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress'])
    : captureCommand(root, 'ps', ['-axo', 'pid=,command=']);
  const processes = process.platform === 'win32'
    ? (listing ? [JSON.parse(listing)].flat() : []).filter(item =>
      /^(?:electron|Interceptor)\.exe$/i.test(item.Name) || /e2e-workflow-tests[\\/](?:run\.mjs|playwright\.config\.ts)/.test(item.CommandLine ?? ''))
      .map(item => `${item.ProcessId} ${item.Name} ${item.CommandLine ?? ''}`)
    : listing.split('\n').filter(line =>
      /\/Contents\/MacOS\/(?:Electron|Interceptor)(?:\s|$)/.test(line) || /node .*e2e-workflow-tests\/(?:run\.mjs|playwright\.config\.ts)/.test(line));
  check(processes.length === 0, `Another App/workflow owns the host; do not terminate it:\n${processes.join('\n')}`);
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(8888, '127.0.0.1', () => server.close(error => error ? reject(error) : resolve()));
  }).catch(error => { throw new Error('Port 8888 is occupied; close the other App and restore the host first.', { cause: error }); });
}

export async function captureApplication(app) {
  const platform = process.platform;
  const architecture = process.arch;
  if (app) {
    check(platform === 'darwin' || platform === 'win32', 'Packaged workflows require a native Windows executable or macOS .app.');
    const appPath = await realpath(path.resolve(app));
    let version;
    let directory;
    if (platform === 'darwin') {
      check(appPath.endsWith('.app') && (await lstat(appPath)).isDirectory(), 'Select a macOS .app directory.');
      version = captureCommand(root, '/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', path.join(appPath, 'Contents/Info.plist')]);
      runCommand(root, 'codesign', ['--verify', '--deep', '--strict', '--all-architectures', appPath]);
      directory = appPath;
    } else {
      check(appPath.toLowerCase().endsWith('.exe') && (await lstat(appPath)).isFile(), 'Select the Windows Interceptor.exe, not an installer.');
      directory = path.dirname(appPath);
      const bytes = await readFile(appPath);
      check(bytes.length >= 64 && bytes.readUInt16LE(0) === 0x5a4d, 'Invalid Windows executable.');
      const peOffset = bytes.readUInt32LE(0x3c);
      check(peOffset + 6 <= bytes.length && bytes.readUInt32LE(peOffset) === 0x00004550, 'Invalid Windows PE header.');
      const machine = bytes.readUInt16LE(peOffset + 4);
      check((architecture === 'x64' && machine === 0x8664) || (architecture === 'arm64' && machine === 0xaa64),
        `Windows executable architecture differs from ${architecture}.`);
      const metadata = JSON.parse(extractFile(path.join(directory, 'resources/app.asar'), 'package.json').toString('utf8'));
      check(metadata.name === '@interceptor/desktop' && typeof metadata.version === 'string', 'Not an Interceptor application package.');
      version = metadata.version;
    }
    const hashes = [];
    for await (const file of glob('**/*', { cwd: directory })) {
      const absolute = path.join(directory, file);
      const info = await lstat(absolute);
      if (info.isFile()) hashes.push([file.split(path.sep).join('/'), digest(await readFile(absolute))]);
      else if (info.isSymbolicLink()) hashes.push([file.split(path.sep).join('/'), 'symlink', await readlink(absolute)]);
    }
    hashes.sort(([left], [right]) => left.localeCompare(right));
    return { path: appPath, version, platform, architecture, target: 'packaged-app', sha256: digest(JSON.stringify(hashes)) };
  }
  const version = (await readJson(path.join(desktop, 'package.json'))).version;
  const files = new Set(['apps/desktop/.vite/build/main.cjs', 'apps/desktop/.vite/build/preload.cjs',
    'apps/desktop/.vite/renderer/main_window/index.html', 'apps/proxy-core/dist/proxy-core/entry.cjs']);
  for await (const file of glob(['apps/desktop/.vite/**/*', 'apps/proxy-core/dist/**/*',
    'packages/core-protocol/dist/**/*', 'packages/platform-capabilities/dist/**/*'], { cwd: root })) {
    if ((await lstat(path.join(root, file))).isFile()) files.add(file.split(path.sep).join('/'));
  }
  const hashes = [];
  for (const file of [...files].sort()) hashes.push([file, digest(await readFile(path.join(root, file)))]);
  return { path: desktop, version, platform, architecture, target: 'local-electron', sha256: digest(JSON.stringify(hashes)) };
}

export async function captureInputs(plan) {
  const files = new Set([
    ...plan.workflows.map(workflow => `workflows/${workflow.file}`),
    'run.mjs', 'playwright.config.ts',
  ]);
  const directory = path.join(desktop, 'tests/e2e-workflow-tests');
  for await (const file of glob('fixtures/**/*.{ts,swift,mjs}', { cwd: directory })) files.add(file.split(path.sep).join('/'));
  const inputs = {};
  for (const file of [...files].sort()) {
    const bytes = await readFile(path.join(directory, file));
    inputs[file] = digest(file.endsWith('.workflow.ts') ? bytes.toString('utf8').replaceAll('\r\n', '\n') : bytes);
  }
  const sharedFiles = new Set([
    'package.json', 'package-lock.json', 'apps/desktop/package.json', 'apps/playground/package.json',
    'apps/desktop/src/shared/automation-ids.ts',
  ]);
  for await (const file of glob('apps/playground/server/**/*.ts', { cwd: root })) sharedFiles.add(file.split(path.sep).join('/'));
  for (const file of [...sharedFiles].sort()) inputs[`repository/${file}`] = digest(await readFile(path.join(root, file)));
  for (const workflow of plan.workflows) check(inputs[`workflows/${workflow.file}`] === workflow.workflowSha256,
    `Workflow changed since mapping approval: ${workflow.file}`);
  return inputs;
}

export function workflowCaptureInputs(inputs, workflow) {
  const source = `workflows/${workflow.file}`;
  check(typeof inputs?.[source] === 'string', `Missing capture source: ${workflow.file}`);
  return Object.fromEntries(Object.entries(inputs)
    .filter(([file]) => !file.startsWith('workflows/') || file === source)
    .sort(([left], [right]) => left.localeCompare(right)));
}
