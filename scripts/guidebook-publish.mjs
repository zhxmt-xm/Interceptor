import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
  assertHostAvailable, captureCommand, captureInputs, check, desktop, digest, dimensionFile,
  documentRegions, escapeRegex, parsePublicationPlan, planFile, readJson, relativeFile,
  root, runCommand, same, verifyDiscoveredTests, verifySourceRun,
} from './guidebook-capture.mjs';
import {
  gitBlobSha, homepageBranch, homepageRepository, publishHomepageChanges,
  readHomepageHead, readHomepageSnapshot,
} from './guidebook-github.mjs';

export function readRemotePublication() {
  const snapshot = readHomepageSnapshot();
  check(snapshot.entries.has(planFile), `Homepage has no ${planFile}. Publish the reviewed mapping once before using this menu.`);
  return { snapshot, ...parsePublicationPlan(JSON.parse(snapshot.readFile(planFile).toString('utf8'))) };
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
  for (const binding of plan.values) {
    const address = runs.get(binding.source)?.manifest.examples?.[binding.example];
    check(typeof address === 'string', `Missing explicit live example: ${binding.source}/${binding.example}`);
    const url = new URL(address);
    check(['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)
      && ['127.0.0.1', 'localhost'].includes(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash, `Invalid live example: ${binding.key}`);
    const port = url.port || (url.protocol === 'https:' || url.protocol === 'wss:' ? '443' : '80');
    for (const document of binding.documents) {
      if (!documents.has(document.file)) documents.set(document.file, snapshot.readFile(document.file).toString('utf8'));
      const text = documents.get(document.file);
      const regions = documentRegions(text);
      const edits = replacements.get(document.file) ?? new Map();
      let count = 0;
      for (const declaration of document.regions) {
        const region = regions.get(declaration.anchor);
        check(region, `Missing bound anchor: ${document.file}#${declaration.anchor}`);
        const matches = [...text.slice(region.start, region.end).matchAll(new RegExp(`(?<!\\d)${binding.port}(?!\\d)`, 'g'))];
        check(matches.length === declaration.occurrences, `Example count changed: ${document.file}#${declaration.anchor}`);
        for (const match of matches) {
          const start = region.start + match.index;
          check(!edits.has(start) || edits.get(start).value === port, `Conflicting example bindings: ${document.file}:${start}`);
          edits.set(start, { start, end: start + binding.port.length, value: port });
          count++;
        }
      }
      check(count === document.occurrences, `Incomplete example binding: ${document.file}/${binding.key}`);
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
  for (const binding of plan.values) {
    for (const document of binding.documents) {
      const text = documents.get(document.file);
      const regions = documentRegions(text);
      document.occurrences = 0;
      for (const declaration of document.regions) {
        const region = regions.get(declaration.anchor);
        declaration.occurrences = [...text.slice(region.start, region.end).matchAll(new RegExp(`(?<!\\d)${binding.port}(?!\\d)`, 'g'))].length;
        document.occurrences += declaration.occurrences;
      }
    }
  }
  for (const group of plan.groups) {
    const source = runs.get(group.source);
    check(source, `Missing complete source: ${group.source}`);
    const previous = JSON.parse(snapshot.readFile(`${group.directory}/manifest.json`).toString('utf8'));
    const steps = [];
    const assets = [];
    for (const mapping of group.images) {
      const image = source.images.get(mapping.checkpoint);
      check(image, `Missing mapped checkpoint: ${group.source}/${mapping.checkpoint}`);
      const selected = mapping.image === mapping.rawImage ? image.raw : image.annotated;
      check(selected, `Missing annotation: ${group.directory}/${mapping.id}`);
      for (const [name, asset] of new Map([[mapping.rawImage, image.raw], [mapping.image, selected]])) {
        const target = `${group.directory}/${name}`;
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
        id: mapping.id, checkpointKey: mapping.checkpoint, title: image.step.title,
        language: image.step.language, theme: image.step.theme, window: image.step.window,
        image: mapping.image, rawImage: mapping.rawImage,
        ...(mapping.image !== mapping.rawImage ? {
          highlights: image.step.annotated.highlights, coordinateSpace: image.step.annotated.coordinateSpace,
          sourceViewport: image.step.annotated.sourceViewport,
        } : {}),
      });
    }
    addBytes(`${group.directory}/manifest.json`, Buffer.from(`${JSON.stringify({
      schemaVersion: 1, chapter: previous.chapter ?? path.posix.basename(group.directory),
      ...(previous.title ? { title: previous.title } : {}),
      appVersion: plan.appVersion, appLanguage: 'en', platform: `macOS ${plan.architecture}`,
      source: {
        workflow: source.manifest.workflow, test: source.manifest.test,
        manifestSha256: source.manifestSha256, workflowSha256: source.manifest.workflowSha256,
        capture: 'native-window', target: 'macos-signed-app',
      },
      steps, assets,
    }, null, 2)}\n`));
  }
  const dimensionLines = Object.entries(dimensions).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, size]) => `  ${JSON.stringify(key)}: [${size[0]}, ${size[1]}]`);
  addBytes(dimensionFile, Buffer.from(`{\n${dimensionLines.join(',\n')}\n}\n`));
  // The schema's dimensions and numeric labels use Homepage's compact-array formatting.
  const planText = JSON.stringify(plan, null, 2).replace(
    /\[\n\s+((?:"[1-9][0-9]*"|[0-9]+)(?:,\n\s+(?:"[1-9][0-9]*"|[0-9]+))*)\n\s+\]/g,
    (_, values) => `[${values.replace(/,\n\s+/g, ', ')}]`,
  );
  addBytes(planFile, Buffer.from(`${planText}\n`));
  return writes;
}

export async function publishGuidebook({ app, resume, verifyOnly = false }) {
  const { snapshot, plan, sources, destinations } = readRemotePublication();
  check(process.env.npm_execpath, 'Use npm start to run the publisher.');
  check(process.platform === plan.platform && process.arch === plan.architecture,
    `The current screenshot contract requires ${plan.platform}/${plan.architecture}.`);
  const previousDirectory = resume ? await realpath(path.resolve(resume)) : null;
  const previous = previousDirectory ? await readJson(path.join(previousDirectory, 'publication.json')) : null;
  if (previous) {
    check(previous.schemaVersion === 2 && previous.repository === homepageRepository
      && Array.isArray(previous.completedSources) && previous.completedSources.length === sources.size,
    'Resume requires a complete remote-publication capture, not an old local-repository or partial run.');
    if (previous.commit && snapshot.head === previous.commit) {
      check(previous.state === 'committed-without-ref' || previous.state === 'pushed', 'Unexpected previously published state.');
      previous.state = 'pushed';
      previous.finishedAt = new Date().toISOString();
      await writeFile(path.join(previousDirectory, 'publication.json'), `${JSON.stringify(previous, null, 2)}\n`, 'utf8');
      console.log(`Homepage already contains ${previous.commit}. No files were changed.`);
      return previous;
    }
    check(previous.homepageBase === snapshot.head && previous.planBlob === snapshot.entries.get(planFile)?.sha,
      'Homepage main or its mapping changed after capture; start a new complete run.');
  }
  const appPath = await realpath(path.resolve(app ?? previous?.app.path ?? ''));
  const version = captureCommand(root, '/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', path.join(appPath, 'Contents/Info.plist')]);
  check(version === plan.appVersion, `App version ${version} differs from the mapping ${plan.appVersion}.`);
  runCommand(root, 'codesign', ['--verify', '--deep', '--strict', '--all-architectures', appPath]);
  const appSha256 = digest(await readFile(path.join(appPath, 'Contents/Resources/app.asar')));
  const inputs = await captureInputs(plan);
  if (previous) check(previous.app.sha256 === appSha256 && same(previous.captureInputs, inputs),
    'App or capture implementation changed after the saved run.');
  verifyDiscoveredTests(plan);
  const references = verifyRemoteCoverage(snapshot, destinations);
  const outputRoot = path.join(desktop, 'test-results/guidebook-publications');
  await mkdir(outputRoot, { recursive: true });
  const output = previousDirectory ?? await mkdtemp(path.join(outputRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-`));
  const reportPath = path.join(output, 'publication.json');
  if (previous) await writeFile(path.join(output, `previous-${Date.now()}.json`), `${JSON.stringify(previous, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  const report = {
    schemaVersion: 2, startedAt: new Date().toISOString(), state: 'capturing',
    repository: homepageRepository, branch: homepageBranch, homepageBase: snapshot.head,
    planBlob: snapshot.entries.get(planFile).sha,
    sourceCommit: captureCommand(root, 'git', ['rev-parse', 'HEAD']),
    app: { path: appPath, version, sha256: appSha256 }, captureInputs: inputs,
    expectedTests: sources.size, expectedReferences: references, completedSources: [],
    uploadedBlobs: previous?.uploadedBlobs ?? [], changedFiles: [], output,
  };
  const saveReport = () => writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await saveReport();
  console.log(`\n目标：${homepageRepository}/${homepageBranch}，不读取本地Homepage。\n${sources.size}条原测试，${plan.groups.length}组媒体。\n报告：${reportPath}`);
  try {
    const runs = new Map();
    for (const [index, source] of [...sources.values()].entries()) {
      console.log(`\n[${index + 1}/${sources.size}] ${source.test}`);
      const sourceOutput = path.join(output, relativeFile(source.key));
      if (!previous) {
        await assertHostAvailable();
        runCommand(root, process.execPath, [process.env.npm_execpath, 'run', 'test:e2e:workflow',
          '--workspace', '@interceptor/desktop', '--', '--screenshots', `workflows/${source.workflow}`,
          `--project=${source.project}`, '--grep', `(?:^|\\s)${escapeRegex(source.test)}$`, '--output', sourceOutput,
        ], { INTERCEPTOR_E2E_LOCALE: plan.locale, INTERCEPTOR_E2E_MACOS_APP_PATH: appPath });
      }
      const result = await verifySourceRun(sourceOutput, source, plan);
      if (previous) {
        const saved = previous.completedSources.find(entry => entry.key === source.key);
        check(saved?.manifestSha256 === result.manifestSha256 && same(saved.generations, result.generations),
          `Saved capture evidence changed: ${source.key}`);
      }
      runs.set(source.key, result);
      report.completedSources.push({ key: source.key, manifestSha256: result.manifestSha256, generations: result.generations });
      await saveReport();
    }
    if (!previous) await assertHostAvailable();
    check(same(await captureInputs(plan), inputs)
      && digest(await readFile(path.join(appPath, 'Contents/Resources/app.asar'))) === appSha256,
    'Capture inputs changed while running; nothing was published.');
    check(readHomepageHead() === snapshot.head, 'Homepage main changed while capturing; nothing was published.');
    const changes = await buildPublicationChanges(snapshot, plan, runs, destinations);
    const allowed = new Set([planFile, dimensionFile, ...destinations,
      ...plan.groups.map(group => `${group.directory}/manifest.json`),
      ...plan.values.flatMap(value => value.documents.map(document => document.file))]);
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
      `docs(guidebook): refresh verified ${plan.appVersion} screenshots\n\nGenerated by Interceptor npm start from ${report.sourceCommit}.\nAll registered screenshot sources passed with host restoration.\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`);
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
    throw new Error(`${report.error}\n发布阶段：${report.state}\n报告：${reportPath}\n只有完整截图批次可从npm start的“继续发布”恢复；部分或失败截图必须重新运行。`, { cause: error });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    const { values } = parseArgs({
      options: { app: { type: 'string' }, resume: { type: 'string' }, 'verify-only': { type: 'boolean', default: false } },
      allowPositionals: false,
    });
    check(Boolean(values.app) !== Boolean(values.resume), 'Use npm start → Test → E2E → 全部教程截图并发布 Homepage.');
    await publishGuidebook({ app: values.app, resume: values.resume, verifyOnly: values['verify-only'] });
  } catch (error) {
    console.error(`[guidebook-publish] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
