import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm, stat, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { MacosReleaseSmoke } from '../apps/desktop/tests/installer/macos-release-smoke.mjs';
import { desktopDirectory, makersByPackageType, readReleaseRequest, repositoryRoot } from './release-config.mjs';

const sourceRequire = createRequire(path.join(desktopDirectory, 'package.json'));
const forgeApi = sourceRequire('@electron-forge/core').api;
const { spawn } = createRequire(sourceRequire.resolve('@electron-forge/core'))('@malept/cross-spawn-promise');

async function runNpm(args) {
  await spawn('npm', args, { cwd: repositoryRoot, stdio: 'inherit' });
}

async function fileDigest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function buildWindowsBootstrapper(msiPath, version, windowsInstallerVersion) {
  const outputDirectory = path.join(desktopDirectory, 'out/make/nsis/x64');
  await mkdir(outputDirectory, { recursive: true });
  const executablePath = path.join(outputDirectory, `Interceptor-${version}-win32-x64.exe`);
  const templatePath = fileURLToPath(new URL('./windows-bootstrapper.nsi', import.meta.url));
  await spawn('makensis.exe', [
    '/NOCD',
    `/DMSI_PATH=${msiPath}`,
    `/DOUTPUT_PATH=${executablePath}`,
    `/DVERSION=${version}`,
    `/DWINDOWS_VERSION=${windowsInstallerVersion}`,
    `/DICON_PATH=${path.join(desktopDirectory, 'assets/interceptor-icon.ico')}`,
    templatePath,
  ], { cwd: repositoryRoot, stdio: 'inherit' });
  const verificationDirectory = await mkdtemp(path.join(outputDirectory, 'verify-'));
  try {
    await spawn('7z.exe', ['e', executablePath, '*.msi', '-r', `-o${verificationDirectory}`, '-y'], {
      cwd: repositoryRoot, stdio: 'inherit',
    });
    const embeddedMsi = path.join(verificationDirectory, 'Interceptor.msi');
    if (await fileDigest(embeddedMsi) !== await fileDigest(msiPath)) {
      throw new Error('Windows EXE内嵌MSI与本次Forge产物的SHA-256不一致。');
    }
  } finally {
    await rm(verificationDirectory, { recursive: true, force: true });
  }
  return executablePath;
}

function assertSourceCheckout(sourceSha) {
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  if (actual !== sourceSha) throw new Error(`CI源码检出错误：需要 ${sourceSha}，实际为 ${actual}。`);
  try {
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--'], { cwd: repositoryRoot, stdio: 'pipe' });
  } catch (error) {
    if (error.status !== 1) throw error;
    throw new Error('CI源码目录的tracked文件已改变，不能将其当作所选commit构建。', { cause: error });
  }
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (untracked.trim()) throw new Error('CI源码目录存在未跟踪文件，不能将其混入所选commit的产物。');
}

async function main() {
  const { values } = parseArgs({
    options: { target: { type: 'string' } },
    allowPositionals: false,
  });
  const plan = readReleaseRequest();
  const target = plan.targets.find((candidate) => candidate.id === values.target);
  if (!target) throw new Error('请通过 --target 指定本次CI请求中的目标。');
  assertSourceCheckout(plan.sourceSha);
  if (process.platform !== target.platform || process.arch !== target.arch) {
    throw new Error(`${target.id} 必须在对应原生主机上构建；当前为 ${process.platform}/${process.arch}。`);
  }
  process.env.INTERCEPTOR_BUILD_VERSION = plan.version;
  for (const key of [
    'INTERCEPTOR_BUILD_IDENTIFIER',
    'APPLE_SIGN_IDENTITY', 'APPLE_ID', 'APPLE_ID_PASSWORD', 'APPLE_TEAM_ID',
    'WINDOWS_CERTIFICATE_FILE', 'WINDOWS_CERTIFICATE_PASSWORD',
  ]) delete process.env[key];

  console.log(`[release-build 1/5] 源码 ${plan.sourceSha} · 版本 ${plan.version} · ${target.label} · ${target.packages.join('/')}`);
  await runNpm(['run', 'build:core']);
  console.log('[release-build 2/5] 构建当前平台的 native helpers');
  await runNpm(['run', 'build:native', '--workspace', '@interceptor/desktop']);
  await runNpm(['run', 'prepare:android-runtime', '--workspace', '@interceptor/desktop']);
  console.log('[release-build 3/5] 只运行所选 Forge makers');
  const makerPackageTypes = [...new Set(target.packages.map((type) => type === 'exe' ? 'msi' : type))];
  const previousDirectory = process.cwd();
  let results;
  // Forge's Vite config paths are relative to the Desktop working directory.
  process.chdir(desktopDirectory);
  try {
    results = await forgeApi.make({
      dir: desktopDirectory,
      platform: target.platform,
      arch: target.arch,
      overrideTargets: makerPackageTypes.map((type) => makersByPackageType[type]),
      interactive: false,
    });
  } finally {
    process.chdir(previousDirectory);
  }
  if (results.some((result) =>
    result.platform !== target.platform || result.arch !== target.arch ||
    result.packageJSON.version !== plan.version)) {
    throw new Error('Forge 返回的版本、平台或架构与发版配置不一致。');
  }
  const artifacts = results.flatMap((result) => result.artifacts);
  if (artifacts.length !== makerPackageTypes.length ||
      makerPackageTypes.some((type) => artifacts.filter((file) => path.extname(file) === `.${type}`).length !== 1)) {
    throw new Error('Forge 返回的安装包类型或数量与选择不一致。');
  }
  if (target.packages.includes('exe')) {
    const msiPath = artifacts.find((file) => path.extname(file) === '.msi');
    artifacts.push(await buildWindowsBootstrapper(msiPath, plan.version, target.windowsInstallerVersion));
  }
  for (const file of artifacts) {
    if ((await stat(file)).size === 0) throw new Error(`安装包为空：${file}`);
  }
  console.log('[release-build 4/5] 检查实际产物与许可');
  await spawn(process.execPath, [
    fileURLToPath(new URL('../apps/desktop/tests/installer/package-artifact-audit.mjs', import.meta.url)),
  ], { cwd: repositoryRoot, stdio: 'inherit' });
  if (target.platform === 'darwin') {
    await MacosReleaseSmoke.verifyArtifacts(artifacts, target.packages);
  }
  assertSourceCheckout(plan.sourceSha);
  console.log('[release-build 5/5] 归集本次安装包，不混入其他 make 输出');
  const outputDirectory = path.join(desktopDirectory, 'out/release', target.id);
  await mkdir(outputDirectory, { recursive: true });
  for (const type of Object.keys(plan.packageCounts)) {
    const destination = path.join(outputDirectory, `Interceptor-${plan.version}-${target.id}.${type}`);
    if (target.packages.includes(type)) {
      const source = artifacts.find((file) => path.extname(file) === `.${type}`);
      await copyFile(source, destination);
      console.log(destination);
    } else {
      try {
        await unlink(destination);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  console.log('仅构建/审计通过；系统授权、安装/升级/卸载及退出恢复仍需对应实机验收。');
}

try {
  await main();
} catch (error) {
  console.error(`[release-build] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
