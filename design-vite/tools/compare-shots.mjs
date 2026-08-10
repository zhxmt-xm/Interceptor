import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const currentRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'shots',
);
// 基线是仍在服役的静态设计稿；新 SPA 必须逐像素对上它才算合格。
const baselineRoot = path.resolve(
  process.argv[2]
    ?? path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'design',
      'app',
      'shots',
    ),
);
const feature = process.argv[3];

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
  const differentPixels = pixelmatch(
    current.data,
    baseline.data,
    null,
    current.width,
    current.height,
    { threshold: 0.1 },
  );
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

console.log(`Compared: ${comparable.length}; missing: ${missing.length}; resized: ${resized.length}`);
console.log(`Mean difference: ${mean.toFixed(6)}%`);
for (const result of sorted.slice(0, 10)) {
  console.log(`${result.differencePercent.toFixed(6)}%  ${result.imagePath}`);
}
if (missing.length || resized.length) {
  console.log(JSON.stringify({ missing, resized }, null, 2));
  process.exitCode = 1;
}