import { appendFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(
  process.env.INTERCEPTOR_RELEASE_SOURCE_ROOT ?? path.join(import.meta.dirname, '..'),
);
export const desktopDirectory = path.join(repositoryRoot, 'apps/desktop');
export const workflowName = 'release-artifacts.yml';
const semver = createRequire(path.join(repositoryRoot, 'package.json'))('semver');

export const releaseTargets = [
  {
    id: 'darwin-x64',
    label: 'macOS Intel (x64)',
    platform: 'darwin',
    arch: 'x64',
    runner: 'macos-15-intel',
    packageTypes: ['dmg', 'zip'],
  },
  {
    id: 'darwin-arm64',
    label: 'macOS Apple Silicon (arm64)',
    platform: 'darwin',
    arch: 'arm64',
    runner: 'macos-15',
    packageTypes: ['dmg', 'zip'],
  },
  {
    id: 'win32-x64',
    label: 'Windows (x64)',
    platform: 'win32',
    arch: 'x64',
    runner: 'windows-2025',
    packageTypes: ['exe', 'msi', 'zip'],
  },
];

export const makersByPackageType = {
  dmg: '@electron-forge/maker-dmg',
  zip: '@electron-forge/maker-zip',
  msi: '@electron-forge/maker-wix',
};

export function validateVersion(version) {
  if (typeof version !== 'string' || semver.valid(version) !== version) {
    throw new Error('版本必须是不带 v 前缀的完整 SemVer，例如 0.1.0 或 0.2.0-beta.0。');
  }
  return version;
}

export function incrementVersion(version, increment, identifier) {
  validateVersion(version);
  if (increment === 'current') return version;
  if (!['patch', 'minor', 'major', 'prerelease'].includes(increment)) {
    throw new Error(`不支持的版本递增方式：${increment}`);
  }
  const nextVersion = semver.inc(version, increment, identifier);
  if (!nextVersion) throw new Error('无法计算下一个版本。');
  return nextVersion;
}

export function createReleasePlan(version, config, sourceSha) {
  if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(sourceSha)) {
    throw new Error('发版源码必须是完整的40位commit SHA，不能使用可变分支名。');
  }
  validateVersion(version);
  requireObjectKeys(config, ['targets'], 'release-config');
  if (!Array.isArray(config.targets) || config.targets.length === 0) {
    throw new Error('发版配置必须至少选择一个目标。');
  }
  const targetIds = new Set();
  const packageCounts = { dmg: 0, zip: 0, msi: 0, exe: 0 };
  const targets = config.targets.map((target) => {
    requireObjectKeys(target, ['platform', 'arch', 'packages'], '发版目标');
    const supported = releaseTargets.find((candidate) =>
      candidate.platform === target.platform && candidate.arch === target.arch);
    if (!supported || targetIds.has(supported.id)) {
      throw new Error(`不支持或重复的目标：${target.platform}/${target.arch}`);
    }
    targetIds.add(supported.id);
    if (!Array.isArray(target.packages) || target.packages.length === 0 ||
        new Set(target.packages).size !== target.packages.length ||
        target.packages.some((type) => !supported.packageTypes.includes(type))) {
      throw new Error(`${supported.label} 的包类型只能从 ${supported.packageTypes.join(', ')} 中选择，且不能重复或留空。`);
    }
    if (supported.platform === 'win32' && semver.parse(version).build.length > 0) {
      throw new Error('Windows安装器不支持build metadata；alpha/beta/rc预发布版本可以使用。');
    }
    if (supported.platform === 'win32' &&
        (semver.major(version) > 255 || semver.minor(version) > 255 || semver.patch(version) > 65535)) {
      throw new Error('Windows MSI 版本段上限为 255.255.65535，不能截断版本号后继续发布。');
    }
    for (const type of target.packages) packageCounts[type]++;
    return {
      id: supported.id,
      label: supported.label,
      platform: supported.platform,
      arch: supported.arch,
      runner: supported.runner,
      packages: [...target.packages],
      ...(supported.platform === 'win32'
        ? { windowsInstallerVersion: `${semver.major(version)}.${semver.minor(version)}.${semver.patch(version)}.0` }
        : {}),
    };
  });
  return {
    sourceSha,
    version,
    tag: `v${version}`,
    prerelease: semver.prerelease(version) !== null,
    targets,
    packageCounts,
    assetCount: Object.values(packageCounts).reduce((total, count) => total + count, 0),
  };
}

function requireObjectKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some((key) => !keys.includes(key)) ||
      keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error(`${label} 的字段必须为：${keys.join(', ')}。`);
  }
}

export function readReleaseRequest() {
  if (!process.env.RELEASE_TARGETS) throw new Error('缺少本次发版目标RELEASE_TARGETS。');
  return createReleasePlan(
    process.env.RELEASE_VERSION,
    { targets: JSON.parse(process.env.RELEASE_TARGETS) },
    process.env.RELEASE_SOURCE_SHA,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const plan = readReleaseRequest();
    if (process.env.GITHUB_OUTPUT) {
      const matrix = {
        include: plan.targets.map(({ id, platform, arch, runner }) => ({ id, platform, arch, runner })),
      };
      await appendFile(process.env.GITHUB_OUTPUT, [
        `matrix=${JSON.stringify(matrix)}`,
        `source_sha=${plan.sourceSha}`,
        `targets=${JSON.stringify(plan.targets.map(({ platform, arch, packages }) => ({ platform, arch, packages })))}`,
        `version=${plan.version}`,
        `prerelease=${plan.prerelease}`,
        `asset_count=${plan.assetCount}`,
        `package_counts=${JSON.stringify(plan.packageCounts)}`,
        `summary=${plan.targets.map((target) => `${target.label}: ${target.packages.join('/')}`).join('; ')}`,
        '',
      ].join('\n'), 'utf8');
    } else {
      console.log(JSON.stringify(plan, null, 2));
    }
  } catch (error) {
    console.error(`[release-config] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
