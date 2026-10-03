import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';

import { checkbox, confirm, input, select } from '@inquirer/prompts';
import semver from 'semver';
import stringWidth from 'string-width';

import {
  createReleasePlan,
  incrementVersion,
  readReleasePlan,
  releaseConfigPath,
  releaseTargets,
  repositoryRoot,
  toReleaseConfig,
  validateVersion,
  workflowName,
} from './release-config.mjs';
import {
  captureCommand,
  readGit,
  readGitHubRepository,
  requireCleanWorktree,
  requirePushedCommit,
  runCommand,
  runNpm,
} from './release-commands.mjs';

const releaseFiles = ['apps/desktop/package.json', 'package-lock.json', '.github/release-config.json'];

function printColumns(rows) {
  const widths = rows[0].map((_, index) => Math.max(...rows.map((row) => stringWidth(row[index]))));
  for (const row of rows) {
    console.log(`  ${row.map((cell, index) =>
      cell + ' '.repeat(widths[index] - stringWidth(cell) + 3)).join('').trimEnd()}`);
  }
}

function printPlan(plan, context) {
  console.log('\n发版信息');
  printColumns([
    ['版本', plan.version],
    ['tag', plan.tag],
    ['仓库', context.repository],
    ['分支', context.branch],
    ['起始提交', context.commit],
  ]);
  console.log(`\n构建目标 · ${plan.assetCount} 个安装包`);
  printColumns([
    ['平台', '架构', '安装包', 'CI runner'],
    ...plan.targets.map((target) => [
      target.platform === 'darwin' ? 'macOS' : 'Windows',
      target.arch,
      target.packages.join(' / ').toUpperCase(),
      target.runner,
    ]),
  ]);
  console.log('\n自动提交文件');
  for (const file of releaseFiles) console.log(`  ${file}`);
  console.log('\n自动执行');
  console.log('  更新配置 → 检查/构建 → commit/push → CI → tag/draft');
  console.log('  实机验收后，再确认 Publish。');
  console.log('\n注意');
  if (plan.prerelease) console.log('  预发布版本，不进入稳定版更新。');
  if (plan.targets.some((target) => target.platform === 'darwin')) {
    console.log('  macOS：ad-hoc 签名，未经过 Apple 公证。');
  }
  if (plan.targets.some((target) => target.platform === 'win32')) {
    console.log('  Windows：安装包未签名。');
  }
  for (const target of plan.targets) {
    if (target.platform === 'darwin' && !target.packages.includes('dmg')) {
      console.log(`  macOS ${target.arch} 仅 ZIP：只供手动分发，内置更新需要 DMG。`);
    }
  }
  console.log('  业务代码须已提交；不会夹带修改或公开仓库。\n');
}

async function choosePlan(current) {
  const increment = await select({
    message: `选择版本更新方式（当前 ${current.version}）`,
    choices: [
      { name: `沿用当前版本：${current.version}（首次发布）`, value: 'current' },
      { name: `Patch 补丁版本：${incrementVersion(current.version, 'patch')}`, value: 'patch' },
      { name: `Minor 次版本：${incrementVersion(current.version, 'minor')}`, value: 'minor' },
      { name: `Major 主版本：${incrementVersion(current.version, 'major')}`, value: 'major' },
      { name: '预发布版本：alpha / beta / rc（仅 macOS）', value: 'prerelease' },
      { name: '输入指定版本', value: 'custom' },
    ],
  });
  let version;
  if (increment === 'custom') {
    version = await input({
      message: '输入版本号，不带 v 前缀',
      validate: (value) => semver.valid(value) === value || '请输入完整 SemVer，例如 0.2.0 或 0.2.0-beta.0。',
    });
  } else {
    const identifier = increment === 'prerelease'
      ? await select({
          message: '选择预发布标识',
          choices: ['beta', 'rc', 'alpha'].map((value) => ({ name: value, value })),
        })
      : undefined;
    version = incrementVersion(current.version, increment, identifier);
  }
  validateVersion(version);
  const windowsVersion = semver.prerelease(version) === null && semver.parse(version).build.length === 0;
  const selectedIds = await checkbox({
    message: '选择平台和 CPU 架构（Space 勾选，Enter 确认）',
    choices: releaseTargets.map((target) => ({
      name: target.label,
      value: target.id,
      checked: current.targets.some((selected) => selected.id === target.id) &&
        (target.platform !== 'win32' || windowsVersion),
      disabled: target.platform === 'win32' && !windowsVersion ? 'MSI 当前只支持稳定版本' : false,
    })),
    validate: (values) => values.length > 0 || '至少选择一个目标。',
  });
  const targets = [];
  for (const id of selectedIds) {
    const target = releaseTargets.find((candidate) => candidate.id === id);
    const previous = current.targets.find((candidate) => candidate.id === id);
    const packages = target.platform === 'win32'
      ? ['msi']
      : await checkbox({
          message: `${target.label}：选择安装包类型`,
          choices: target.packageTypes.map((type) => ({
            name: type.toUpperCase(),
            value: type,
            checked: previous ? previous.packages.includes(type) : true,
          })),
          validate: (values) => values.length > 0 || '至少选择一种安装包。',
        });
    targets.push({ platform: target.platform, arch: target.arch, packages });
  }
  return createReleasePlan(version, { targets });
}

async function savePlan(current, plan) {
  const latest = await readReleasePlan();
  if (latest.version !== current.version ||
      JSON.stringify(toReleaseConfig(latest)) !== JSON.stringify(toReleaseConfig(current))) {
    throw new Error('选择期间版本或发版配置已被修改，请重新运行向导；未覆盖其他修改。');
  }
  if (current.version !== plan.version) {
    runNpm(['version', plan.version, '--workspace', '@interceptor/desktop', '--no-git-tag-version', '--ignore-scripts']);
  }
  await writeFile(releaseConfigPath, `${JSON.stringify(toReleaseConfig(plan), null, 2)}\n`, 'utf8');
  return new Map(await Promise.all(releaseFiles.map(async (file) =>
    [file, await readFile(path.join(repositoryRoot, file))])));
}

function checkPrerequisites(plan, context) {
  requireCleanWorktree();
  captureCommand('gh', ['--version']);
  captureCommand('gh', ['auth', 'status', '--hostname', 'github.com']);
  requireUnchangedSource(context);
  requireUnusedTag(plan.tag);
}

function requireUnchangedSource(context) {
  if (readGit(['rev-parse', 'HEAD']) !== context.commit ||
      readGit(['symbolic-ref', '--short', 'HEAD']) !== context.branch ||
      readGitHubRepository() !== context.repository) {
    throw new Error('发版期间分支、commit或origin已改变，停止操作，请先检查当前状态。');
  }
}

function requireUnusedTag(tag) {
  if (readGit(['tag', '--list', tag]) ||
      readGit(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`])) {
    throw new Error(`${tag} 已存在，不会删除或覆盖。已启动的运行请从Actions恢复；新发行请选择新的版本号。`);
  }
}

function verifyLocalBuild(plan) {
  runNpm(['run', 'build:core']);
  runNpm(['run', 'typecheck']);
  runNpm(['run', 'test', '--workspaces', '--if-present', '--', '--no-file-parallelism']);
  const nativeTarget = plan.targets.find((target) =>
    target.platform === process.platform && target.arch === process.arch);
  if (nativeTarget) {
    runNpm(['run', 'release:build', '--', '--target', nativeTarget.id]);
  } else {
    console.log(`本机 ${process.platform}/${process.arch} 不在所选目标中；原生安装包由对应CI runner构建，不计为本机已验证。`);
  }
}

async function commitAndPush(plan, context, snapshots) {
  requireUnchangedSource(context);
  const changed = captureCommand('git', ['diff', '--name-only', 'HEAD', '-z']).split('\0').filter(Boolean);
  const untracked = captureCommand('git', ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  if (untracked.length || changed.some((file) => !releaseFiles.includes(file))) {
    throw new Error('检查期间出现了其他工作区修改，停止提交；不会夹带或清理这些文件。');
  }
  for (const [file, expected] of snapshots) {
    if (!(await readFile(path.join(repositoryRoot, file))).equals(expected)) {
      throw new Error(`检查期间 ${file} 被修改，停止提交，不覆盖其他修改。`);
    }
  }
  if (changed.length > 0) {
    runCommand('git', ['add', '--', ...releaseFiles]);
    const staged = captureCommand('git', ['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean);
    if (staged.some((file) => !releaseFiles.includes(file))) {
      throw new Error('暂存区出现了其他文件，停止commit；请检查Source Control。');
    }
    for (const file of staged) {
      if (captureCommand('git', ['show', `:${file}`]) !== snapshots.get(file).toString('utf8')) {
        throw new Error(`暂存的 ${file} 与本次生成内容不一致，停止commit。`);
      }
    }
    runCommand('git', ['commit', '--only', '-m', `chore(release): prepare ${plan.tag}`, '--', ...releaseFiles]);
  } else {
    console.log('版本和配置没有变化，沿用当前commit。');
  }
  runCommand('git', ['push', 'origin', 'HEAD']);
  return { repository: context.repository, ...requirePushedCommit() };
}

function listRuns(context, event) {
  return JSON.parse(captureCommand('gh', [
    'run', 'list', '--repo', context.repository, '--workflow', workflowName,
    '--event', event, '--commit', context.commit, '--limit', '50',
    '--json', 'databaseId,displayTitle,headSha,conclusion,url',
  ]));
}

async function watchRun(context, event, title) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const run = listRuns(context, event).find((candidate) => candidate.displayTitle === title);
    if (run) {
      if (run.headSha !== context.commit) throw new Error('CI 的 commit 与确认的 commit 不一致。');
      console.log(`CI 已启动：${run.url}`);
      console.log('等待 CI 结果。停止本地等待不会取消远端运行，也不会撤销 tag。');
      runCommand('gh', ['run', 'watch', String(run.databaseId), '--repo', context.repository, '--exit-status']);
      return;
    }
    await delay(3_000);
  }
  throw new Error(`未能在一分钟内定位这次运行；不要重复触发，请先查看 https://github.com/${context.repository}/actions/workflows/${workflowName}`);
}

async function runCiPreview(context) {
  const latest = requirePushedCommit();
  if (latest.branch !== context.branch || latest.commit !== context.commit) {
    throw new Error('确认期间分支或 commit 已改变，请重新运行向导。');
  }
  const requestId = randomUUID();
  runCommand('gh', [
    'workflow', 'run', workflowName, '--repo', context.repository,
    '--ref', context.branch, '-f', `request_id=${requestId}`,
  ]);
  await watchRun(context, 'workflow_dispatch', `Release ${requestId}`);
}

async function createDraftRelease(plan, context) {
  const successfulPreview = listRuns(context, 'workflow_dispatch')
    .some((run) => run.headSha === context.commit && run.conclusion === 'success');
  if (!successfulPreview) {
    throw new Error('未确认同一个commit的CI演练成功，停止创建tag。');
  }
  requireCleanWorktree();
  requireUnchangedSource(context);
  requireUnusedTag(plan.tag);
  runCommand('git', ['tag', '-a', plan.tag, '-m', `Interceptor ${plan.version}`, context.commit]);
  runCommand('git', ['push', 'origin', `refs/tags/${plan.tag}`]);
  await watchRun(context, 'push', `Release ${plan.tag}`);
}

function readRelease(plan, context) {
  const result = captureCommand('gh', [
    'api', '--paginate', `repos/${context.repository}/releases`,
    '--jq', `.[] | select(.tag_name == ${JSON.stringify(plan.tag)})`,
  ]).trim();
  if (!result) throw new Error(`没有找到 ${plan.tag} 的Release，停止发布。`);
  const release = JSON.parse(result);
  const expectedNames = plan.targets.flatMap((target) =>
    target.packages.map((type) => `Interceptor-${plan.version}-${target.id}.${type}`)).sort();
  if (release.tag_name !== plan.tag || release.prerelease !== plan.prerelease ||
      typeof release.draft !== 'boolean' || !Number.isSafeInteger(release.id) ||
      typeof release.html_url !== 'string' ||
      !Array.isArray(release.assets) ||
      JSON.stringify(release.assets.map((asset) => asset.name).sort()) !== JSON.stringify(expectedNames) ||
      release.assets.some((asset) =>
        asset.state !== 'uploaded' || asset.size <= 0 ||
        !/^sha256:[a-f0-9]{64}$/.test(asset.digest))) {
    throw new Error('Release版本、附件类型或完整性元数据与本次配置不一致，停止发布。');
  }
  return release;
}

function artifactFingerprint(release) {
  return JSON.stringify({
    id: release.id,
    assets: release.assets.map(({ id, name, size, digest, updated_at }) =>
      ({ id, name, size, digest, updated_at })).sort((left, right) => left.name.localeCompare(right.name)),
  });
}

async function publishAfterAcceptance(plan, context) {
  const draft = readRelease(plan, context);
  if (!draft.draft) throw new Error('该Release已不再是draft，停止自动操作，请检查GitHub状态。');
  console.log(`\n[6/7] 等待实机验收：${draft.html_url}`);
  console.log('保持此终端打开，从草稿下载，完成所有所选平台的安装、系统授权和退出恢复。');
  if (!await confirm({
    message: '实机验收全部通过，现在 Publish？',
    default: true,
  })) {
    console.log(`保留草稿，未Publish：${draft.html_url}`);
    return;
  }
  const checked = readRelease(plan, context);
  if (!checked.draft || artifactFingerprint(checked) !== artifactFingerprint(draft)) {
    throw new Error('验收期间草稿或附件发生变化，未Publish；请重新核对和验收。');
  }
  console.log('[7/7] Publish Release');
  runCommand('gh', ['release', 'edit', plan.tag, '--repo', context.repository, '--draft=false']);
  const published = readRelease(plan, context);
  if (published.draft) throw new Error('GitHub尚未确认发布成功，请检查Release页面，不要重复发版。');
  console.log(`发布完成：${published.html_url}`);
  console.log('仓库可见性没有更改；private仓库的已发布Release仍然是private。');
}

async function main() {
  const { values } = parseArgs({
    options: { help: { type: 'boolean', short: 'h' } },
    allowPositionals: false,
  });
  if (values.help) {
    console.log('npm run release');
    console.log('选择版本/目标/包类型 → 确认执行 → 检查/提交/推送/CI/tag/草稿 → 实机验收确认 → Publish');
    console.log('完整步骤：architecture/release-guide.md');
    return;
  }
  const current = await readReleasePlan();
  console.log('\nInterceptor 连续发版流程');
  console.log('↑/↓ 移动，Space 勾选，Enter 确认，Ctrl+C 退出。');
  const plan = await choosePlan(current);
  const context = {
    repository: readGitHubRepository(),
    branch: readGit(['symbolic-ref', '--short', 'HEAD']),
    commit: readGit(['rev-parse', 'HEAD']),
  };
  printPlan(plan, context);
  if (!await confirm({
    message: '开始发版？',
    default: true,
  })) {
    console.log('已取消，未修改文件，也未执行GitHub或发布操作。');
    return;
  }
  checkPrerequisites(plan, context);
  console.log('[1/7] 更新版本和发版配置');
  const snapshots = await savePlan(current, plan);
  console.log('[2/7] 本地检查与对应目标构建');
  verifyLocalBuild(plan);
  console.log('[3/7] 提交发版配置并推送');
  const pushed = await commitAndPush(plan, context, snapshots);
  console.log('[4/7] 自动运行CI演练并等待结果');
  await runCiPreview(pushed);
  console.log('[5/7] 创建tag并等待CI生成草稿');
  await createDraftRelease(plan, pushed);
  await publishAfterAcceptance(plan, pushed);
}

try {
  await main();
} catch (error) {
  if (error instanceof Error && error.name === 'ExitPromptError') {
    console.log('\n已取消本地操作；已保存的文件或已启动的远端流程不会自动回滚。');
    process.exitCode = 130;
  } else {
    console.error(`\n[release] ${error instanceof Error ? error.message : String(error)}`);
    console.error('未自动回滚任何文件或 tag。恢复步骤见 architecture/release-guide.md。');
    process.exitCode = 1;
  }
}
