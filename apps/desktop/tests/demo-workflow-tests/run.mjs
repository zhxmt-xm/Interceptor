import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = path.resolve(import.meta.dirname);
const desktop = path.resolve(directory, '../..');
const featureRoot = path.join(directory, 'workflows');
const args = process.argv.slice(2);

function argument(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

function fail(message) {
  console.error(`[demo] ${message}`);
  process.exit(1);
}

const features = readdirSync(featureRoot)
  .filter((file) => file.endsWith('.workflow.ts'))
  .map((file) => file.replace(/\.workflow\.ts$/, ''))
  .sort();
const featureConfigFile = path.join(directory, 'features.json');
const featureConfig = existsSync(featureConfigFile)
  ? JSON.parse(readFileSync(featureConfigFile, 'utf8'))
  : {};
const feature = argument('feature');
if (!feature) fail(`Missing --feature. Available: ${features.join(', ')}`);
if (!features.includes(feature)) fail(`Unknown feature: ${feature}. Available: ${features.join(', ')}`);

const locale = argument('locale', 'en-US');
const app = argument('app', process.env.INTERCEPTOR_E2E_APP_PATH
  ?? path.join(
    desktop,
    'out',
    `Interceptor-${process.platform}-${process.arch}`,
    process.platform === 'win32' ? 'Interceptor.exe' : 'Interceptor.app',
  ));
if (!existsSync(app)) {
  fail(`App not found: ${app}\nRun npm run package first, or pass --app / INTERCEPTOR_E2E_APP_PATH.`);
}
if (!process.env.npm_execpath) fail('Run this entry through npm run test:demo:workflow.');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve(argument('output', path.join(desktop, 'test-results/demo-videos', `${stamp}-${feature}`)));
const capture = path.join(output, 'capture');
const playwrightOutput = path.join(output, 'playwright');

const playwright = spawnSync(process.execPath, [
  process.env.npm_execpath,
  'exec',
  '--no',
  '--',
  'playwright',
  'test',
  '--config',
  'tests/demo-workflow-tests/playwright.config.ts',
  `workflows/${feature}.workflow.ts`,
  '--output',
  playwrightOutput,
], {
  cwd: desktop,
  stdio: 'inherit',
  env: {
    ...process.env,
    INTERCEPTOR_E2E_APP_PATH: app,
    INTERCEPTOR_E2E_LOCALE: locale,
    INTERCEPTOR_DEMO_FEATURE: feature,
    INTERCEPTOR_DEMO_OUTPUT: capture,
  },
});
if (playwright.error) throw playwright.error;
if (playwright.status !== 0) {
  console.error(`[demo] recording failed; output: ${playwrightOutput}`);
  process.exit(playwright.status ?? 1);
}

const assembleArgs = [path.join(directory, 'assemble.mjs'), '--run', output];
const readmeAsset = featureConfig[feature]?.readmeAsset;
if (readmeAsset) assembleArgs.push('--asset', readmeAsset);
const assemble = spawnSync(process.execPath, assembleArgs, {
  cwd: desktop,
  stdio: 'inherit',
});
if (assemble.error) throw assemble.error;
if (assemble.status !== 0) process.exit(assemble.status ?? 1);

console.log(`[demo] video: ${path.join(output, 'video.mp4')}`);
console.log(`[demo] subtitles: ${path.join(output, 'captions.ass')}`);
if (readmeAsset) console.log(`[demo] README asset: ${path.join(desktop, '..', '..', readmeAsset)}`);
console.log(`[demo] output: ${output}`);
