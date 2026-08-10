import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const currentRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'shots',
);
const positional = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
// 基线是仍在服役的静态设计稿；新 SPA 必须逐像素对上它才算合格。
const baselineRoot = path.resolve(
  positional[0]
    ?? path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'design',
      'app',
      'shots',
    ),
);
// 百分比会骗人（侧栏图标全丢只算 1%），所以默认就把差异图写出来供目测。
const diffRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'shots-diff',
);
const feature = positional[1];

async function collect(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path.join(directory, entry.name), relativePath));
    else if (entry.name.endsWith('.png')) files.push(relativePath);
  }
  return files;
}

const allPaths = await collect(currentRoot);
const imagePaths = feature
  ? allPaths.filter((imagePath) => imagePath.split(path.sep)[1] === feature)
  : allPaths;
const results = [];
await rm(diffRoot, { recursive: true, force: true });

for (const imagePath of imagePaths) {
  let baselineBuffer;
  try {
    baselineBuffer = await readFile(path.join(baselineRoot, imagePath));
  } catch {
    results.push({ imagePath, missing: true });
    continue;
  }
  const current = PNG.sync.read(await readFile(path.join(currentRoot, imagePath)));
  const baseline = PNG.sync.read(baselineBuffer);
  if (current.width !== baseline.width || current.height !== baseline.height) {
    results.push({
      imagePath,
      size: `${current.width}x${current.height}`,
      baselineSize: `${baseline.width}x${baseline.height}`,
    });
    continue;
  }
  const diff = new PNG({ width: current.width, height: current.height });
  const differentPixels = pixelmatch(
    current.data,
    baseline.data,
    diff.data,
    current.width,
    current.height,
    { threshold: 0.1 },
  );
  if (differentPixels > 0) {
    const target = path.join(diffRoot, imagePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, PNG.sync.write(diff));
  }
  results.push({
    imagePath,
    differencePercent: differentPixels / (current.width * current.height) * 100,
  });
}

const comparable = results.filter((result) => result.differencePercent !== undefined);
const missing = results.filter((result) => result.missing);
const resized = results.filter((result) => result.size);
const sorted = comparable.toSorted((left, right) => right.differencePercent - left.differencePercent);
const mean = comparable.reduce((sum, result) => sum + result.differencePercent, 0) / comparable.length;
const identical = comparable.filter((result) => result.differencePercent === 0);

console.log(`Compared: ${comparable.length}; missing: ${missing.length}; resized: ${resized.length}`);
console.log(`Identical: ${identical.length}/${comparable.length}; differing: ${comparable.length - identical.length}`);
console.log(`Mean difference: ${mean.toFixed(6)}%`);
for (const result of sorted.filter((entry) => entry.differencePercent > 0)) {
  console.log(`${result.differencePercent.toFixed(6)}%  ${result.imagePath}`);
}
if (missing.length || resized.length) {
  console.log(JSON.stringify({ missing, resized }, null, 2));
}
if (missing.length || resized.length || identical.length !== comparable.length) {
  process.exitCode = 1;
}