import { copyFile, mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { api as forgeApi } from '@electron-forge/core';

import { MacosReleaseSmoke } from '../apps/desktop/tests/installer/macos-release-smoke.mjs';
import { desktopDirectory, makersByPackageType, readReleasePlan } from './release-config.mjs';
import { runNpm } from './release-commands.mjs';

async function main() {
  const { values } = parseArgs({
    options: { target: { type: 'string' } },
    allowPositionals: false,
  });
  const plan = await readReleasePlan();
  const target = plan.targets.find((candidate) => candidate.id === values.target);
  if (!target) throw new Error('请通过 --target 指定 release-config.json 中已选择的目标。');
  if (process.platform !== target.platform || process.arch !== target.arch) {
    throw new Error(`${target.id} 必须在对应原生主机上构建；当前为 ${process.platform}/${process.arch}。`);
  }
  process.env.INTERCEPTOR_BUILD_VERSION = plan.version;
  for (const key of [
    'INTERCEPTOR_BUILD_IDENTIFIER',
    'APPLE_SIGN_IDENTITY', 'APPLE_ID', 'APPLE_ID_PASSWORD', 'APPLE_TEAM_ID',
    'WINDOWS_CERTIFICATE_FILE', 'WINDOWS_CERTIFICATE_PASSWORD',
  ]) delete process.env[key];

  console.log(`[release-build 1/5] ${plan.version} · ${target.label} · ${target.packages.join('/')}`);
  runNpm(['run', 'build:core']);
  console.log('[release-build 2/5] 构建当前平台的 native helpers');
  runNpm(['run', 'build:native', '--workspace', '@interceptor/desktop']);
  console.log('[release-build 3/5] 只运行所选 Forge makers');
  const previousDirectory = process.cwd();
  let results;
  // Forge's Vite config paths are relative to the Desktop working directory.
  process.chdir(desktopDirectory);
  try {
    results = await forgeApi.make({
      dir: desktopDirectory,
      platform: target.platform,
      arch: target.arch,
      overrideTargets: target.packages.map((type) => makersByPackageType[type]),
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
  if (artifacts.length !== target.packages.length ||
      target.packages.some((type) => artifacts.filter((file) => path.extname(file) === `.${type}`).length !== 1)) {
    throw new Error('Forge 返回的安装包类型或数量与选择不一致。');
  }
  for (const file of artifacts) {
    if ((await stat(file)).size === 0) throw new Error(`安装包为空：${file}`);
  }
  console.log('[release-build 4/5] 检查实际产物与许可');
  runNpm(['run', 'test:package-audit']);
  if (target.platform === 'darwin') {
    await MacosReleaseSmoke.verifyArtifacts(artifacts, target.packages);
  }
  console.log('[release-build 5/5] 归集本次安装包，不混入其他 make 输出');
  const outputDirectory = path.join(desktopDirectory, 'out/release', target.id);
  await mkdir(outputDirectory, { recursive: true });
  for (const type of ['dmg', 'zip', 'msi']) {
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
