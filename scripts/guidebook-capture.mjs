import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { glob, lstat, readFile, realpath } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

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
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  } catch (error) {
    throw new Error(`${executable} failed: ${String(error.stderr ?? error.message).trim()}`, { cause: error });
  }
}

export function runCommand(cwd, executable, args, environment = {}) {
  const result = spawnSync(executable, args, { cwd, stdio: 'inherit', env: { ...process.env, ...environment } });
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

export function parsePublicationPlan(plan) {
  check(plan.schemaVersion === 1 && plan.repository === 'zhxmt-xm/Interceptor-Homepage'
    && plan.branch === 'main', 'Unsupported Homepage publication contract.');
  check(plan.platform === 'darwin' && plan.locale === 'en-US' && typeof plan.appVersion === 'string'
    && ['x64', 'arm64'].includes(plan.architecture), 'Invalid native App publication identity.');
  check(Array.isArray(plan.sources) && plan.sources.length > 0 && Array.isArray(plan.groups) && plan.groups.length > 0,
    'The screenshot publication contract is empty.');
  const sources = new Map();
  for (const source of plan.sources) {
    check(/^[a-z0-9][a-z0-9.-]+$/.test(source.key) && !sources.has(source.key), `Invalid source key: ${source.key}`);
    check(typeof source.test === 'string' && source.test.length > 0 && source.workflow.endsWith('.workflow.ts'), `Invalid test: ${source.key}`);
    relativeFile(source.workflow);
    check(['macos', 'macos-scroll-boundary'].includes(source.project)
      && /^[a-f0-9]{64}$/.test(source.workflowSha256), `Invalid source contract: ${source.key}`);
    check(Array.isArray(source.checkpoints) && source.checkpoints.length > 0, `Missing checkpoints: ${source.key}`);
    const keys = new Set();
    for (const point of source.checkpoints) {
      check(/^[a-z0-9][a-z0-9.-]+$/.test(point.key) && !keys.has(point.key), `Duplicate checkpoint: ${source.key}/${point.key}`);
      check(typeof point.title === 'string' && ['app', 'native-dialog'].includes(point.window)
        && ['light', 'dark', 'warm', 'ember'].includes(point.theme), `Invalid checkpoint state: ${point.key}`);
      check(Array.isArray(point.labels) && new Set(point.labels).size === point.labels.length
        && point.labels.every(label => /^[1-9]\d*$/.test(label)), `Invalid highlight labels: ${point.key}`);
      check(Array.isArray(point.dimensions) && point.dimensions.length === 2
        && point.dimensions.every(value => Number.isInteger(value) && value > 0), `Invalid dimensions: ${point.key}`);
      keys.add(point.key);
    }
    sources.set(source.key, source);
  }
  const destinations = new Set();
  const directories = new Set();
  for (const group of plan.groups) {
    relativeFile(group.directory);
    check(group.directory.startsWith('guidebook/media/') && !directories.has(group.directory), `Invalid media group: ${group.directory}`);
    directories.add(group.directory);
    const source = sources.get(group.source);
    check(source && Array.isArray(group.images) && group.images.length > 0, `Unknown group source: ${group.source}`);
    const ids = new Set();
    for (const image of group.images) {
      check(typeof image.id === 'string' && !ids.has(image.id)
        && source.checkpoints.some(point => point.key === image.checkpoint), `Invalid image mapping: ${group.directory}/${image.id}`);
      ids.add(image.id);
      check(/^[\w.-]+\.png$/.test(image.image) && /^[\w.-]+\.png$/.test(image.rawImage), `Invalid image path: ${image.id}`);
      for (const name of new Set([image.image, image.rawImage])) {
        const file = `${group.directory}/${name}`;
        check(!destinations.has(file), `Duplicate image destination: ${file}`);
        destinations.add(file);
      }
    }
  }
  check(Array.isArray(plan.values), 'Missing explicit example bindings.');
  const valueKeys = new Set();
  for (const value of plan.values) {
    check(typeof value.key === 'string' && !valueKeys.has(value.key) && sources.has(value.source)
      && /^[a-z][a-z0-9-]*$/.test(value.example) && /^[1-9]\d{0,4}$/.test(value.port)
      && Number(value.port) <= 65535, `Invalid example: ${value.key}`);
    valueKeys.add(value.key);
    check(Array.isArray(value.documents) && value.documents.length > 0, `Unbound example: ${value.key}`);
    for (const document of value.documents) {
      check(/^guidebook\/(?:zh-CN|en)\/[\w-]+\.md$/.test(document.file)
        && Number.isInteger(document.occurrences) && document.occurrences > 0
        && Array.isArray(document.regions) && document.regions.length > 0, `Invalid example document: ${value.key}`);
      check(document.regions.every(region => (region.anchor === null || typeof region.anchor === 'string')
        && Number.isInteger(region.occurrences) && region.occurrences > 0)
        && document.regions.reduce((total, region) => total + region.occurrences, 0) === document.occurrences,
      `Invalid anchored example counts: ${value.key}`);
    }
  }
  return { plan, sources, destinations };
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
    ...new Set(plan.sources.map(source => `workflows/${source.workflow}`)),
    '--grep', `(?:^|\\s)(?:${plan.sources.map(source => escapeRegex(source.test)).join('|')})$`,
  ]));
  const discovered = [];
  const visit = suite => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) discovered.push({ title: spec.title, file: spec.file.replaceAll('\\', '/'), project: test.projectName });
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of listing.suites ?? []) visit(suite);
  check(discovered.length === plan.sources.length, 'Discovered tests differ from the complete registered set.');
  for (const source of plan.sources) {
    check(discovered.filter(test => test.title === source.test && test.project === source.project
      && (test.file === source.workflow || test.file.endsWith(`/${source.workflow}`))).length === 1,
    `Registered test is missing or ambiguous: ${source.key}`);
  }
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

export async function verifySourceRun(output, source, plan) {
  const manifests = [];
  for await (const relative of glob('**/step-screenshots/manifest.json', { cwd: output })) manifests.push(path.join(output, relative));
  check(manifests.length === 1, `Expected one complete manifest for ${source.key}, found ${manifests.length}.`);
  const bytes = await readFile(manifests[0]);
  const manifest = JSON.parse(bytes.toString('utf8'));
  check(manifest.workflow === source.workflow && manifest.test === source.test
    && manifest.workflowSha256 === source.workflowSha256, `Executed source differs from its contract: ${source.key}`);
  check(manifest.status === 'passed' && manifest.hostRestored === true
    && manifest.appVersion === plan.appVersion && manifest.platform === plan.platform, `Incomplete or incompatible run: ${source.key}`);
  const directory = path.dirname(manifests[0]);
  const generations = [];
  for await (const file of glob('{metadata.json,*-metadata.json}', { cwd: path.dirname(directory) })) {
    const data = await readFile(path.join(path.dirname(directory), file));
    const metadata = JSON.parse(data.toString('utf8'));
    check(metadata.target === 'macos-signed-app' && metadata.platform === plan.platform
      && metadata.architecture === plan.architecture && metadata.gracefulDestroyVerified === true,
    `App generation did not exit normally: ${source.key}/${file}`);
    generations.push({ file, sha256: digest(data) });
  }
  check(generations.length > 0 && manifest.steps.length === source.checkpoints.length, `Missing exit evidence or changed screenshot sequence: ${source.key}`);
  const images = new Map();
  for (const [index, expected] of source.checkpoints.entries()) {
    const step = manifest.steps[index];
    check(step.language === 'en' && step.title === expected.title && step.window === expected.window
      && step.theme === expected.theme && same([step.width, step.height], expected.dimensions)
      && same((step.annotated?.highlights ?? []).map(highlight => highlight.label), expected.labels),
    `Checkpoint changed: ${source.key}/${expected.key}. Update the mapping; no image was guessed.`);
    const raw = await verifyImage(directory, step);
    const annotated = step.annotated ? await verifyImage(directory, step.annotated) : undefined;
    check(same([raw.width, raw.height], expected.dimensions)
      && (!annotated || (annotated.width === raw.width && annotated.height === raw.height)), `PNG size differs: ${expected.key}`);
    images.set(expected.key, { step, raw, annotated });
  }
  return { manifest, manifestSha256: digest(bytes), images, generations };
}

export async function assertHostAvailable() {
  const processes = captureCommand(root, 'ps', ['-axo', 'pid=,command=']).split('\n').filter(line =>
    /\/Contents\/MacOS\/(?:Electron|Interceptor)(?:\s|$)/.test(line) || /node .*e2e-workflow-tests\/run\.mjs/.test(line));
  check(processes.length === 0, `Another App/workflow owns the host; do not terminate it:\n${processes.join('\n')}`);
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(8888, '127.0.0.1', () => server.close(error => error ? reject(error) : resolve()));
  }).catch(error => { throw new Error('Port 8888 is occupied; close the other App and restore the host first.', { cause: error }); });
}

export async function captureInputs(plan) {
  const files = new Set([
    ...plan.sources.map(source => `workflows/${source.workflow}`),
    'run.mjs', 'playwright.config.ts',
  ]);
  const directory = path.join(desktop, 'tests/e2e-workflow-tests');
  for await (const file of glob('fixtures/**/*.{ts,swift,mjs}', { cwd: directory })) files.add(file.split(path.sep).join('/'));
  const inputs = {};
  for (const file of [...files].sort()) inputs[file] = digest(await readFile(path.join(directory, file)));
  const sharedFiles = new Set([
    'package.json', 'package-lock.json', 'apps/desktop/package.json', 'apps/playground/package.json',
    'apps/desktop/src/shared/automation-ids.ts',
  ]);
  for await (const file of glob('apps/playground/server/**/*.ts', { cwd: root })) sharedFiles.add(file.split(path.sep).join('/'));
  for (const file of [...sharedFiles].sort()) inputs[`repository/${file}`] = digest(await readFile(path.join(root, file)));
  for (const source of plan.sources) check(inputs[`workflows/${source.workflow}`] === source.workflowSha256,
    `Workflow changed since mapping approval: ${source.workflow}`);
  return inputs;
}
