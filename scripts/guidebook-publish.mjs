import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rmdir, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
  assertHostAvailable, captureApplication, captureCommand, captureInputs, check, desktop, digest, dimensionFile,
  documentRegions, escapeRegex, parsePublicationPlan, planFile, readJson, relativeFile,
  root, runCommand, same, verifyDiscoveredTests, verifyWorkflowRun, workflowCaptureInputs,
} from './guidebook-capture.mjs';
import {
  gitBlobSha, homepageBranch, homepageRepository, publishHomepageChanges,
  readHomepageHead, readHomepageSnapshot,
} from './guidebook-github.mjs';

const require = createRequire(import.meta.url);

async function formatGeneratedJson(snapshot, changes) {
  const expectedVersion = JSON.parse(snapshot.readFile('package.json').toString('utf8')).devDependencies['@biomejs/biome'];
  check(require('@biomejs/biome/package.json').version === expectedVersion,
    'App and Homepage must use the same Biome version to format published metadata.');
  const configuration = JSON.parse(snapshot.readFile('biome.json').toString('utf8'));
  check(!configuration.extends, 'The remote Biome configuration requires additional files; update the publisher before continuing.');
  const directory = await mkdtemp(path.join(tmpdir(), 'interceptor-guidebook-format-'));
  const configFile = path.join(directory, 'biome.json');
  try {
    await writeFile(configFile, JSON.stringify({ ...configuration, vcs: { ...configuration.vcs, enabled: false } }), 'utf8');
    for (const [file, content] of changes) {
      if (!file.endsWith('.json')) continue;
      const input = await content.read();
      const bytes = execFileSync(process.execPath, [
        require.resolve('@biomejs/biome/bin/biome'), 'format',
        '--config-path', directory, '--stdin-file-path', file,
      ], { cwd: directory, input, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
      check(same(JSON.parse(input.toString('utf8')), JSON.parse(bytes.toString('utf8'))),
        `Formatting changed generated metadata: ${file}`);
      changes.set(file, { sha: gitBlobSha(bytes), read: async () => bytes });
    }
  } finally {
    await unlink(configFile);
    await rmdir(directory);
  }
}

export function readRemotePublication() {
  const snapshot = readHomepageSnapshot();
  check(snapshot.entries.has(planFile), `Homepage has no ${planFile}. Publish the reviewed mapping once before using this menu.`);
  const parsed = parsePublicationPlan(JSON.parse(snapshot.readFile(planFile).toString('utf8')));
  const retainedMedia = verifyRetainedMedia(snapshot, parsed.plan, parsed.destinations);
  return { snapshot, ...parsed, retainedMedia };
}

export function verifyRetainedMedia(snapshot, plan, destinations) {
  if (plan.retainedMedia === undefined || plan.retainedMedia.length === 0) return [];
  const dimensions = JSON.parse(snapshot.readFile(dimensionFile).toString('utf8'));
  return plan.retainedMedia.map(group => {
    const manifestFile = group.manifest;
    const directory = path.posix.dirname(manifestFile);
    const bytes = snapshot.readFile(manifestFile);
    check(digest(bytes) === group.manifestSha256, `Reviewed media manifest changed: ${manifestFile}`);
    const manifest = JSON.parse(bytes.toString('utf8'));
    const verification = manifest.source?.hostVerification;
    const realHost = manifest.source?.workflow === 'mcp/current-host.workflow.ts';
    const localWorkflow = manifest.source?.kind === 'local-development-validation';
    const publicPage = manifest.source?.url === `https://github.com/zhxmt-xm/Interceptor/releases`;
    const releasedApp = typeof manifest.appVersion === 'string'
      && manifest.sourceRelease === `https://github.com/zhxmt-xm/Interceptor/releases/tag/v${manifest.appVersion}`
      && /^[a-f0-9]{64}$/.test(manifest.releaseAssetSha256);
    check(realHost || localWorkflow || publicPage || releasedApp,
      `Missing reviewed media provenance: ${manifestFile}`);
    if (realHost) {
      check(manifest.schemaVersion === 1 && typeof manifest.appVersion === 'string' && manifest.appVersion.length > 0
        && manifest.appLanguage === 'en' && typeof manifest.platform === 'string' && manifest.platform.trim().length > 0
        && typeof verification?.hostKind === 'string' && verification.hostKind.trim().length > 0
        && typeof verification.hostVersion === 'string' && verification.hostVersion.trim().length > 0
        && /^[a-f0-9]{64}$/.test(verification.nativeCallsSha256)
        && /^[a-f0-9]{64}$/.test(verification.verificationSha256),
      `Missing real Host verification: ${manifestFile}`);
    } else if (localWorkflow) {
      check(manifest.schemaVersion === 1 && manifest.source.repository === 'zhxmt-xm/Interceptor'
        && /^[a-f0-9]{40}$/.test(manifest.source.commit)
        && typeof manifest.source.appVersion === 'string' && manifest.source.appVersion.length > 0
        && typeof manifest.source.platform === 'string' && manifest.source.platform.length > 0
        && manifest.verification?.businessAssertionsPassed === true
        && manifest.verification.gracefulDestroyVerified === true && manifest.verification.hostRestored === true
        && manifest.verification.releaseAsset === false,
      `Missing local workflow verification: ${manifestFile}`);
    } else if (publicPage) {
      check(manifest.schemaVersion === 1 && manifest.source.authentication === 'anonymous'
        && typeof manifest.source.browser === 'string' && manifest.source.browser.length > 0
        && /^\d{4}-\d{2}-\d{2}$/.test(manifest.source.capturedAt),
      `Missing public page capture provenance: ${manifestFile}`);
    }
    const assets = realHost || releasedApp ? manifest.assets : manifest.images;
    check(Array.isArray(assets) && assets.length > 0, `Empty retained media: ${manifestFile}`);
    const referencedAssets = new Set();
    const stepIds = new Set();
    if (realHost || releasedApp) {
      check(Array.isArray(manifest.steps) && manifest.steps.length > 0, `Missing retained steps: ${manifestFile}`);
      for (const step of manifest.steps) {
        check(typeof step.id === 'string' && !stepIds.has(step.id) && /^[\w.-]+\.png$/.test(step.image),
          `Invalid retained step: ${manifestFile}/${step.id}`);
        stepIds.add(step.id);
        referencedAssets.add(step.image);
        if (realHost) {
          check(step.language === 'en' && step.window === 'app' && /^[\w.-]+\.png$/.test(step.rawImage),
            `Invalid retained Host step: ${manifestFile}/${step.id}`);
          referencedAssets.add(step.rawImage);
        }
      }
    }
    const files = new Set();
    for (const asset of assets) {
      relativeFile(asset.file);
      check(asset.file.endsWith('.png') && !files.has(asset.file)
        && (!realHost && !releasedApp || referencedAssets.has(asset.file)),
      `Invalid retained asset: ${manifestFile}/${asset.file}`);
      if (localWorkflow) check(typeof asset.workflow === 'string' && asset.workflow.endsWith('.workflow.ts')
        && /^step-\d+$/.test(asset.sourceStep) && typeof asset.privacy === 'string' && asset.privacy.length > 0,
      `Missing reviewed local image provenance: ${manifestFile}/${asset.file}`);
      const file = `${directory}/${asset.file}`;
      check(!destinations.has(file), `Retained asset overlaps an automatic destination: ${file}`);
      const image = snapshot.readFile(file);
      check(image.length >= 24 && image.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
        && Number.isInteger(asset.width) && asset.width > 0 && Number.isInteger(asset.height) && asset.height > 0
        && digest(image) === asset.sha256 && image.length === asset.bytes
        && image.readUInt32BE(16) === asset.width && image.readUInt32BE(20) === asset.height
        && same(dimensions[file.slice('guidebook/media/'.length)], [asset.width, asset.height]),
      `Retained image or dimensions changed: ${file}`);
      files.add(asset.file);
      destinations.add(file);
    }
    if (realHost || releasedApp) check(files.size === referencedAssets.size, `Incomplete retained images: ${manifestFile}`);
    return {
      manifest: manifestFile, manifestSha256: group.manifestSha256,
      source: manifest.source ?? { release: manifest.sourceRelease, releaseAssetSha256: manifest.releaseAssetSha256 },
      appVersion: manifest.appVersion ?? manifest.source?.appVersion,
      steps: manifest.steps?.length, assets: files.size, reexecuted: false,
    };
  });
}

export function verifyRemoteCoverage(snapshot, destinations) {
  let references = 0;
  const languages = new Map();
  for (const file of snapshot.entries.keys()) {
    const match = /^guidebook\/(zh-CN|en)\/([\w-]+)\.md$/.exec(file);
    if (!match) continue;
    const images = [];
    const text = snapshot.readFile(file).toString('utf8');
    for (const image of text.matchAll(/!\[[^\]]*\]\(([^)\s]+\.png)(?:\s+"[^"]*")?\)/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), image[1]));
      check(destinations.has(target), `Tutorial image has no registered destination: ${file}: ${image[1]}`);
      images.push(target);
      references++;
    }
    const entry = languages.get(match[2]) ?? {};
    entry[match[1]] = images;
    languages.set(match[2], entry);
  }
  check(languages.size > 0 && references > 0, 'Homepage contains no tutorial image references.');
  for (const [chapter, images] of languages) check(images.en && images['zh-CN'] && same(images.en, images['zh-CN']),
    `Bilingual image sequences differ: ${chapter}`);
  for (const file of destinations) {
    const entry = snapshot.entries.get(file);
    check(entry?.type === 'blob' && entry.mode === '100644', `Missing regular image target: ${file}`);
  }
  return references;
}

export async function buildPublicationChanges(snapshot, plan, runs, destinations) {
  const writes = new Map();
  const addBytes = (file, bytes) => writes.set(file, { sha: gitBlobSha(bytes), read: async () => bytes });
  const dimensions = JSON.parse(snapshot.readFile(dimensionFile).toString('utf8'));
  const documents = new Map();
  const replacements = new Map();
  const examples = plan.workflows.flatMap(workflow => workflow.examples.map(binding => ({ workflow, binding })));
  for (const { workflow, binding } of examples) {
    const name = `${workflow.file}/${binding.name}`;
    const address = runs.get(workflow)?.manifest.examples?.[binding.name];
    check(typeof address === 'string', `Missing explicit live example: ${name}`);
    const url = new URL(address);
    check(['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)
      && ['127.0.0.1', 'localhost'].includes(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash, `Invalid live example: ${name}`);
    const port = url.port || (url.protocol === 'https:' || url.protocol === 'wss:' ? '443' : '80');
    for (const document of binding.documents) {
      if (!documents.has(document.file)) documents.set(document.file, snapshot.readFile(document.file).toString('utf8'));
      const text = documents.get(document.file);
      const regions = documentRegions(text);
      const edits = replacements.get(document.file) ?? new Map();
      for (const declaration of document.regions) {
        const region = regions.get(declaration.anchor);
        check(region, `Missing bound anchor: ${document.file}#${declaration.anchor}`);
        const matches = [...text.slice(region.start, region.end).matchAll(new RegExp(`(?<!\\d)${binding.port}(?!\\d)`, 'g'))];
        check(matches.length === declaration.occurrences, `Example count changed: ${document.file}#${declaration.anchor}`);
        for (const match of matches) {
          const start = region.start + match.index;
          check(!edits.has(start) || edits.get(start).value === port, `Conflicting example bindings: ${document.file}:${start}`);
          edits.set(start, { start, end: start + binding.port.length, value: port });
        }
      }
      replacements.set(document.file, edits);
    }
    binding.port = port;
  }
  for (const [file, source] of documents) {
    let text = source;
    for (const edit of [...replacements.get(file).values()].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, edit.start) + edit.value + text.slice(edit.end);
    }
    documents.set(file, text);
    addBytes(file, Buffer.from(text));
  }
  for (const { binding } of examples) {
    for (const document of binding.documents) {
      const text = documents.get(document.file);
      const regions = documentRegions(text);
      for (const declaration of document.regions) {
        const region = regions.get(declaration.anchor);
        declaration.occurrences = [...text.slice(region.start, region.end).matchAll(new RegExp(`(?<!\\d)${binding.port}(?!\\d)`, 'g'))].length;
      }
    }
  }
  const media = new Map();
  for (const workflow of plan.workflows) {
    const run = runs.get(workflow);
    check(run, `Missing complete workflow: ${workflow.file}/${workflow.testName}`);
    for (const [index, step] of workflow.steps.entries()) {
      if (step.image.target === null) continue;
      const directory = path.posix.dirname(step.image.target);
      const group = media.get(directory) ?? { run, images: [] };
      group.images.push({ ...step.image, captured: run.images[index] });
      media.set(directory, group);
    }
  }
  for (const [directory, group] of media) {
    const source = group.run;
    const previous = JSON.parse(snapshot.readFile(`${directory}/manifest.json`).toString('utf8'));
    const steps = [];
    const assets = [];
    for (const mapping of group.images) {
      const image = mapping.captured;
      check(image, `Missing captured step for: ${mapping.target}`);
      const selected = mapping.target === mapping.rawTarget ? image.raw : image.annotated;
      check(selected, `Missing annotation: ${mapping.target}`);
      for (const [target, asset] of new Map([[mapping.rawTarget, image.raw], [mapping.target, selected]])) {
        const name = path.posix.basename(target);
        check(destinations.has(target), `Unregistered generated image: ${target}`);
        const bytes = await readFile(asset.file);
        check(digest(bytes) === asset.sha256, `Screenshot changed: ${asset.file}`);
        writes.set(target, {
          sha: gitBlobSha(bytes),
          read: async () => {
            const current = await readFile(asset.file);
            check(digest(current) === asset.sha256, `Screenshot changed before upload: ${asset.file}`);
            return current;
          },
        });
        assets.push({ file: name, width: asset.width, height: asset.height, bytes: asset.bytes, sha256: asset.sha256 });
        dimensions[target.slice('guidebook/media/'.length)] = [asset.width, asset.height];
      }
      steps.push({
        id: path.posix.basename(mapping.rawTarget, '.png'), title: image.step.title,
        language: image.step.language, theme: image.step.theme, window: image.step.window,
        capture: source.application.platform === 'darwin' || image.step.window === 'native-dialog'
          ? 'native-window' : 'renderer',
        image: path.posix.basename(mapping.target), rawImage: path.posix.basename(mapping.rawTarget),
        ...(mapping.target !== mapping.rawTarget ? {
          highlights: image.step.annotated.highlights, coordinateSpace: image.step.annotated.coordinateSpace,
          sourceViewport: image.step.annotated.sourceViewport,
        } : {}),
      });
    }
    addBytes(`${directory}/manifest.json`, Buffer.from(`${JSON.stringify({
      schemaVersion: 1, chapter: previous.chapter ?? path.posix.basename(directory),
      ...(previous.title ? { title: previous.title } : {}),
      appVersion: plan.appVersion, appLanguage: 'en',
      platform: `${source.application.platform === 'darwin' ? 'macOS' : source.application.platform === 'win32' ? 'Windows' : source.application.platform} ${source.application.architecture}`,
      source: {
        workflow: source.manifest.workflow, test: source.manifest.test,
        manifestSha256: source.manifestSha256, workflowSha256: source.manifest.workflowSha256,
        capture: [...new Set(steps.map(step => step.capture))].join('+'), target: source.application.target,
      },
      steps, assets,
    }, null, 2)}\n`));
    const groupDimensions = `${directory}/dimension-entries.json`;
    if (snapshot.entries.has(groupDimensions)) {
      const entries = JSON.parse(snapshot.readFile(groupDimensions).toString('utf8'));
      check(Array.isArray(entries), `Invalid existing dimension metadata: ${groupDimensions}`);
      for (const entry of entries) {
        check(typeof entry.path === 'string' && entry.path.startsWith(`${directory.slice('guidebook/media/'.length)}/`)
          && Array.isArray(dimensions[entry.path]), `Invalid group dimension entry: ${groupDimensions}`);
        entry.dimensions = dimensions[entry.path];
      }
      addBytes(groupDimensions, Buffer.from(JSON.stringify(entries)));
    }
  }
  const dimensionLines = Object.entries(dimensions).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, size]) => `  ${JSON.stringify(key)}: [${size[0]}, ${size[1]}]`);
  addBytes(dimensionFile, Buffer.from(`{\n${dimensionLines.join(',\n')}\n}\n`));
  addBytes(planFile, Buffer.from(JSON.stringify(plan)));
  await formatGeneratedJson(snapshot, writes);
  return writes;
}

export async function readReusableWorkflowRuns(directory, previous, plan, application, inputs) {
  const reusable = new Map();
  if (!previous || !same(previous.app, application)) return reusable;
  const entries = new Map();
  for (const saved of previous.completedWorkflows) {
    const identity = JSON.stringify([saved.file, saved.testName]);
    check(!entries.has(identity), `Duplicate saved workflow: ${saved.file}/${saved.testName}`);
    entries.set(identity, saved);
  }
  const base = await realpath(directory);
  for (const workflow of plan.workflows) {
    const saved = entries.get(JSON.stringify([workflow.file, workflow.testName]));
    if (!saved || !same(saved.captureInputs, workflowCaptureInputs(inputs, workflow))) continue;
    const workflowOutput = await realpath(path.join(base, relativeFile(saved.directory)));
    const relative = path.relative(base, workflowOutput);
    check(relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative),
      `Saved workflow escapes its publication directory: ${saved.directory}`);
    const result = await verifyWorkflowRun(workflowOutput, workflow, plan, application);
    check(saved.manifestSha256 === result.manifestSha256 && same(saved.generations, result.generations),
      `Saved capture evidence changed: ${workflow.file}/${workflow.testName}`);
    reusable.set(workflow, { saved, result });
  }
  return reusable;
}

export async function publishGuidebook({ app, resume, verifyOnly = false }) {
  const { snapshot, plan, destinations, mediaDirectories, retainedMedia } = readRemotePublication();
  check(process.env.npm_execpath, 'Use npm start to run the publisher.');
  const previousDirectory = resume ? await realpath(path.resolve(resume)) : null;
  const previous = previousDirectory ? await readJson(path.join(previousDirectory, 'publication.json')) : null;
  if (previous) {
    check(previous.schemaVersion === 4 && previous.repository === homepageRepository
      && previous.branch === homepageBranch && Array.isArray(previous.completedWorkflows)
      && previous.completedWorkflows.every(entry => entry.captureInputs && typeof entry.captureInputs === 'object'),
    'Resume requires a schema 4 publication report with per-workflow capture inputs.');
    if (previous.commit && snapshot.head === previous.commit) {
      check(previous.state === 'committed-without-ref' || previous.state === 'pushed', 'Unexpected previously published state.');
      check(same(previous.completedWorkflows.map(entry => [entry.file, entry.testName]),
        plan.workflows.map(workflow => [workflow.file, workflow.testName])), 'Published report has incomplete workflow coverage.');
      previous.state = 'pushed';
      previous.finishedAt = new Date().toISOString();
      await writeFile(path.join(previousDirectory, 'publication.json'), `${JSON.stringify(previous, null, 2)}\n`, 'utf8');
      console.log(`Homepage already contains ${previous.commit}. No files were changed.`);
      return previous;
    }
    if (previous.commit) check(previous.homepageBase === snapshot.head && previous.planBlob === snapshot.entries.get(planFile)?.sha,
      'Homepage main or its mapping changed after the candidate commit; it cannot be resumed.');
  }
  const inputs = await captureInputs(plan);
  const selectedArtifact = app ?? (previous?.app.target === 'packaged-app' ? previous.app.path : undefined)
    ?? process.env.INTERCEPTOR_E2E_APP_PATH
    ?? (process.platform === 'darwin' ? process.env.INTERCEPTOR_E2E_MACOS_APP_PATH : undefined);
  check(process.platform === 'win32' || process.platform === 'darwin', 'Tutorial screenshots require a native Windows or macOS App.');
  const artifact = selectedArtifact || path.join(desktop, 'out', `Interceptor-${process.platform}-${process.arch}`,
    process.platform === 'win32' ? 'Interceptor.exe' : 'Interceptor.app');
  await assertHostAvailable();
  if (!previous && !selectedArtifact) runCommand(root, process.execPath, [process.env.npm_execpath, 'run', 'package']);
  const application = await captureApplication(artifact);
  check(application.version === plan.appVersion, `App version ${application.version} differs from the mapping ${plan.appVersion}.`);
  const reusable = await readReusableWorkflowRuns(previousDirectory, previous, plan, application, inputs);
  if (previous?.commit) check(reusable.size === plan.workflows.length,
    'Capture inputs changed after the candidate commit; it cannot be resumed.');
  const projects = verifyDiscoveredTests(plan);
  const references = verifyRemoteCoverage(snapshot, destinations);
  const outputRoot = path.join(desktop, 'test-results/guidebook-publications');
  await mkdir(outputRoot, { recursive: true });
  const output = previousDirectory ?? await mkdtemp(path.join(outputRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-`));
  const reportPath = path.join(output, 'publication.json');
  if (previous) await writeFile(path.join(output, `previous-${Date.now()}.json`), `${JSON.stringify(previous, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  const report = {
    schemaVersion: 4, startedAt: new Date().toISOString(), state: 'capturing',
    repository: homepageRepository, branch: homepageBranch, homepageBase: snapshot.head,
    planBlob: snapshot.entries.get(planFile).sha,
    sourceCommit: captureCommand(root, 'git', ['rev-parse', 'HEAD']),
    app: application, captureInputs: inputs,
    expectedTests: plan.workflows.length, expectedReferences: references,
    completedWorkflows: [...reusable.values()].map(entry => entry.saved), retainedMedia,
    uploadedBlobs: previous?.uploadedBlobs ?? [], changedFiles: [], output,
    ...(previous?.commit ? {
      commit: previous.commit, candidateTree: previous.candidateTree, candidateChanges: previous.candidateChanges,
    } : {}),
  };
  const saveReport = () => writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await saveReport();
  console.log(`\n目标：${homepageRepository}/${homepageBranch}，不读取本地Homepage。\n复用${reusable.size}条有效流程，补拍${plan.workflows.length - reusable.size}条，${mediaDirectories.size}组自动更新媒体。\n报告：${reportPath}`);
  if (retainedMedia.length > 0) {
    console.log(`${retainedMedia.length}组独立实录已按审核摘要校验，保留原图，未在本次重拍。`);
  }
  try {
    const runs = new Map([...reusable].map(([workflow, entry]) => [workflow, entry.result]));
    const attempt = reusable.size < plan.workflows.length ? await mkdtemp(path.join(output, 'capture-')) : null;
    for (const [index, workflow] of plan.workflows.entries()) {
      console.log(`\n[${index + 1}/${plan.workflows.length}] ${workflow.testName}`);
      if (reusable.has(workflow)) {
        console.log('已重新核对完整截图和退出证据，复用本流程。');
        continue;
      }
      report.currentWorkflow = { file: workflow.file, testName: workflow.testName };
      await saveReport();
      const directory = `${path.basename(attempt)}/workflow-${String(index + 1).padStart(3, '0')}`;
      const workflowOutput = path.join(output, directory);
      await assertHostAvailable();
      runCommand(desktop, process.execPath, [process.env.npm_execpath, 'exec', '--no', '--', 'playwright', 'test',
          '--config', 'tests/e2e-workflow-tests/playwright.config.ts', `workflows/${workflow.file}`,
          ...(projects.get(workflow) ? [`--project=${projects.get(workflow)}`] : []),
          '--grep', `(?:^|\\s)${escapeRegex(workflow.testName)}$`, '--output', workflowOutput,
        ], { INTERCEPTOR_E2E_LOCALE: plan.locale, INTERCEPTOR_E2E_STEP_SCREENSHOTS: '1',
          INTERCEPTOR_E2E_APP_PATH: artifact, INTERCEPTOR_E2E_MACOS_APP_PATH: '' });
      const result = await verifyWorkflowRun(workflowOutput, workflow, plan, application);
      runs.set(workflow, result);
      report.completedWorkflows.push({ file: workflow.file, testName: workflow.testName,
        directory, captureInputs: workflowCaptureInputs(inputs, workflow),
        manifestSha256: result.manifestSha256, generations: result.generations });
      await saveReport();
    }
    report.completedWorkflows = plan.workflows.map(workflow => report.completedWorkflows.find(entry =>
      entry.file === workflow.file && entry.testName === workflow.testName));
    delete report.currentWorkflow;
    await assertHostAvailable();
    check(same(await captureInputs(plan), inputs)
      && same(await captureApplication(artifact), application),
    'Capture inputs changed while running; nothing was published.');
    check(readHomepageHead() === snapshot.head, 'Homepage main changed while capturing; nothing was published.');
    const changes = await buildPublicationChanges(snapshot, plan, runs, destinations);
    const allowed = new Set([planFile, dimensionFile, ...destinations,
      ...[...mediaDirectories].map(directory => `${directory}/manifest.json`),
      ...[...mediaDirectories].map(directory => `${directory}/dimension-entries.json`).filter(file => snapshot.entries.has(file)),
      ...plan.workflows.flatMap(workflow => workflow.examples.flatMap(example => example.documents.map(document => document.file)))]);
    for (const file of changes.keys()) check(allowed.has(file), `Unexpected generated path: ${file}`);
    report.changedFiles = [...changes].filter(([file, content]) => content.sha !== snapshot.entries.get(file)?.sha).map(([file]) => file);
    report.state = 'prepared';
    await saveReport();
    if (verifyOnly) {
      report.state = 'verified-without-publication';
      report.finishedAt = new Date().toISOString();
      await saveReport();
      console.log(`完整截图和映射已核对；未上传、未创建commit、未更新main。\n报告：${reportPath}`);
      return report;
    }
    const commit = await publishHomepageChanges(snapshot, changes, report, saveReport,
      `docs(guidebook): refresh verified ${plan.appVersion} screenshots\n\nGenerated by Interceptor npm start from ${report.sourceCommit}.\nAll registered automatic screenshot sources passed with host restoration.${retainedMedia.length > 0 ? '\nReviewed independent captures were integrity-checked and preserved, not re-executed.' : ''}\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`);
    report.finishedAt = new Date().toISOString();
    await saveReport();
    console.log(commit
      ? `Homepage已更新：https://github.com/${homepageRepository}/commit/${commit}\n现有网站CI在GitHub运行，命令不等待该CI。`
      : '没有需要更新的文件，不创建空commit。');
    return report;
  } catch (error) {
    report.failedAt = new Date().toISOString();
    report.error = error instanceof Error ? error.message : String(error);
    await saveReport();
    throw new Error(`${report.error}\n发布阶段：${report.state}\n报告：${reportPath}\n可从npm start的“继续截图并发布”恢复：重新校验有效证据，只补缺失或输入失效的流程。`, { cause: error });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    const { values } = parseArgs({
      options: { app: { type: 'string' }, resume: { type: 'string' }, 'verify-only': { type: 'boolean', default: false } },
      allowPositionals: false,
    });
    check(!(values.app && values.resume), 'Use either --app or --resume, not both.');
    await publishGuidebook({ app: values.app, resume: values.resume, verifyOnly: values['verify-only'] });
  } catch (error) {
    console.error(`[guidebook-publish] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
