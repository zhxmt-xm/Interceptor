import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this entry through npm run test:e2e:workflow.');
const screenshots = args.includes('--screenshots');
const forwarded = args.filter(argument => argument !== '--screenshots');
const environment = {
  ...process.env,
  INTERCEPTOR_E2E_STEP_SCREENSHOTS: screenshots ? '1' : '0',
};
const run = async (parameters) => {
  const child = spawn(process.execPath, [npmCli, ...parameters], {
    cwd: desktop, env: environment, stdio: 'inherit',
  });
  const [code, signal] = await once(child, 'exit');
  if (code === null) throw new Error(`Workflow command terminated by ${signal}.`);
  return code;
};
if (!process.env.INTERCEPTOR_E2E_APP_PATH && !(process.platform === 'darwin' && process.env.INTERCEPTOR_E2E_MACOS_APP_PATH)) {
  const prepared = await run(['run', 'e2e:prepare-local']);
  if (prepared !== 0) process.exit(prepared);
}
if (screenshots && !forwarded.some((argument) => argument === '--output' || argument.startsWith('--output='))) {
  const root = path.join(desktop, 'test-results/workflow-screenshots');
  await mkdir(root, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const output = await mkdtemp(path.join(root, `${stamp}-`));
  forwarded.push('--output', output);
  console.log(`步骤截图运行目录：${output}`);
}
process.exitCode = await run([
  'exec', '--no', '--', 'playwright', 'test',
  '--config', 'tests/e2e-workflow-tests/playwright.config.ts', ...forwarded,
]);
