import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';

import { checkbox, confirm, input, select } from '@inquirer/prompts';
import semver from 'semver';
import stringWidth from 'string-width';

import { createReleasePlan, incrementVersion, releaseTargets, validateVersion, workflowName } from './release-config.mjs';
import { captureCommand, readGitHubRepository, runCommand } from './release-commands.mjs';
import { findCommitByHash, readCommittedVersion, readRecentCommits, readRemoteCommit, readRemoteTags } from './release-commits.mjs';

function printColumns(rows) {
  const widths = rows[0].map((_, index) => Math.max(...rows.map((row) => stringWidth(row[index]))));
  for (const row of rows) {
    console.log(`  ${row.map((cell, index) =>
      cell + ' '.repeat(widths[index] - stringWidth(cell) + 3)).join('').trimEnd()}`);
  }
}

function printCommit(commit) {
  printColumns([
    ['源码commit', commit.sha],
    ['提交时间', commit.date],
    ['提交说明', commit.subject || '（无标题）'],
  ]);
}

async function chooseCommit(repository) {
  const recent = readRecentCommits();
  if (recent.length === 0) throw new Error('当前分支没有可选择的commit。');
  while (true) {
    const value = await select({
      message: `选择发版源码（当前分支最近${recent.length}个commit）`,
      pageSize: 12,
      choices: [
        ...recent.map((commit) => ({
          name: `${commit.sha.slice(0, 8)}  ${commit.date}  ${commit.subject || '（无标题）'}`,
          value: commit.sha,
        })),
        { name: '输入hash查询并选择其他commit', value: 'hash' },
      ],
    });
    if (value !== 'hash') {
      const commit = recent.find((candidate) => candidate.sha === value);
      printCommit(commit);
      return commit;
    }
    const hash = await input({
      message: '输入commit hash（短hash或完整SHA）',
      validate: (text) => /^[a-f0-9]{4,40}$/i.test(text.trim()) || '请输入4至40位十六进制hash。',
    });
    let commit;
    try {
      commit = findCommitByHash(repository, hash);
    } catch (error) {
      console.error(`[release] 查询失败：${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    console.log('\n查询结果');
    printCommit(commit);
    if (await confirm({ message: '使用这个commit发版？', default: true })) return commit;
  }
}

function versionFromTag(tag) {
  return semver.valid(tag.startsWith('v') ? tag.slice(1) : tag);
}

async function choosePlan(source, sourceVersion, existingTags) {
  validateVersion(sourceVersion);
  const existingVersions = new Set(existingTags.map(versionFromTag).filter(Boolean));
  const base = semver.rsort([sourceVersion, ...existingVersions])[0];
  const increment = await select({
    message: `选择版本更新方式（基准 ${base}；源码内版本 ${sourceVersion}）`,
    choices: [
      { name: `使用基准版本 ${base}`, value: 'current', disabled: existingVersions.has(base) ? '该版本已有tag' : false },
      { name: `Patch 补丁版本：${incrementVersion(base, 'patch')}`, value: 'patch' },
      { name: `Minor 次版本：${incrementVersion(base, 'minor')}`, value: 'minor' },
      { name: `Major 主版本：${incrementVersion(base, 'major')}`, value: 'major' },
      { name: '预发布版本：alpha / beta / rc（仅 macOS）', value: 'prerelease' },
      { name: '输入指定版本', value: 'custom' },
    ],
  });
  let version;
  if (increment === 'custom') {
    version = await input({
      message: '输入版本号，不带v前缀',
      validate: (value) => semver.valid(value) === value && !existingVersions.has(value) ||
        '请输入完整且未使用的SemVer，例如0.2.0或0.2.0-beta.0。',
    });
  } else {
    const identifier = increment === 'prerelease'
      ? await select({
          message: '选择预发布标识',
          choices: ['beta', 'rc', 'alpha'].map((value) => ({ name: value, value })),
        })
      : undefined;
    version = incrementVersion(base, increment, identifier);
  }
  if (existingVersions.has(version)) throw new Error(`${version} 已有tag，不会删除或覆盖。`);
  const windowsVersion = semver.prerelease(version) === null && semver.parse(version).build.length === 0;
  const selectedIds = await checkbox({
    message: '选择平台和CPU架构（Space勾选，Enter确认）',
    choices: releaseTargets.map((target) => ({
      name: target.label,
      value: target.id,
      checked: target.id === 'darwin-x64',
      disabled: target.platform === 'win32' && !windowsVersion ? 'MSI当前只支持稳定版本' : false,
    })),
    validate: (values) => values.length > 0 || '至少选择一个目标。',
  });
  const targets = [];
  for (const id of selectedIds) {
    const target = releaseTargets.find((candidate) => candidate.id === id);
    const packages = target.platform === 'win32'
      ? ['msi']
      : await checkbox({
          message: `${target.label}：选择安装包类型`,
          choices: target.packageTypes.map((type) => ({ name: type.toUpperCase(), value: type, checked: true })),
          validate: (values) => values.length > 0 || '至少选择一种安装包。',
        });
    targets.push({ platform: target.platform, arch: target.arch, packages });
  }
  return createReleasePlan(version, { targets }, source.sha);
}

function printPlan(plan, context, source) {
  console.log('\n发版信息');
  printColumns([
    ['仓库', context.repository],
    ['源码commit', plan.sourceSha],
    ['源码日期', source.date],
    ['发版版本', plan.version],
    ['tag', plan.tag],
    ['工作流分支', context.workflowRef],
  ]);
  console.log(`\n构建目标 · ${plan.assetCount} 个安装包`);
  printColumns([
    ['平台', '架构', '安装包', 'CI runner'],
    ...plan.targets.map((target) => [
      target.platform === 'darwin' ? 'macOS' : 'Windows',
      target.arch, target.packages.join(' / ').toUpperCase(), target.runner,
    ]),
  ]);
  console.log('\n执行方式');
  console.log('  CI检出上面的源码SHA → 检查/构建 → tag/draft → 实机验收确认 → Publish');
  console.log('  工作流分支只提供编排脚本，不是发版源码；本地未提交修改不会进入安装包。');
  console.log('  不修改本地文件、版本、index或HEAD，不commit、push、stash或清理工作区。');
  if (plan.prerelease) console.log('  此为预发布版本，不进入稳定版更新。');
  for (const target of plan.targets) {
    if (target.platform === 'darwin' && !target.packages.includes('dmg')) {
      console.log(`  macOS ${target.arch} 仅ZIP：只供手动下载，内置更新需要同架构DMG。`);
    }
  }
  console.log('  macOS采用ad-hoc且未公证，Windows未签名；不会自动公开仓库。\n');
}

async function runCi(plan, context) {
  const requestId = randomUUID();
  try {
    runCommand('gh', [
      'workflow', 'run', workflowName, '--repo', context.repository, '--ref', context.workflowRef,
      '-f', `source_sha=${plan.sourceSha}`, '-f', `version=${plan.version}`,
      '-f', `targets=${JSON.stringify(plan.targets.map(({ platform, arch, packages }) => ({ platform, arch, packages })))}`,
      '-f', `request_id=${requestId}`,
    ]);
  } catch (error) {
    throw new Error(`未确认CI已启动。请检查Actions记录、默认分支是否已部署按SHA发版的新版workflow，以及权限/网络；不要盲目重复触发。\n${error.message}`, { cause: error });
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    const runs = JSON.parse(captureCommand('gh', [
      'run', 'list', '--repo', context.repository, '--workflow', workflowName,
      '--event', 'workflow_dispatch', '--limit', '50', '--json', 'databaseId,displayTitle,url',
    ]));
    const run = runs.find((candidate) => candidate.displayTitle === `Release ${requestId}`);
    if (run) {
      console.log(`CI运行：${run.url}`);
      console.log(`发版源码固定为 ${plan.sourceSha}；CI页面的workflow commit是编排版本。`);
      console.log('停止本地等待不会取消远端运行。');
      runCommand('gh', ['run', 'watch', String(run.databaseId), '--repo', context.repository, '--exit-status']);
      return;
    }
    await delay(3_000);
  }
  throw new Error(`一分钟内未定位本轮CI，请先查看 https://github.com/${context.repository}/actions/workflows/${workflowName}，不要重复触发。`);
}

function readRelease(plan, context) {
  const tagSource = captureCommand('gh', [
    'api', `repos/${context.repository}/commits/${encodeURIComponent(plan.tag)}`, '--jq', '.sha',
  ]).trim();
  if (tagSource !== plan.sourceSha) throw new Error('远端tag没有指向选定源码SHA，停止发布。');
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
      typeof release.html_url !== 'string' || !Array.isArray(release.assets) ||
      JSON.stringify(release.assets.map((asset) => asset.name).sort()) !== JSON.stringify(expectedNames) ||
      release.assets.some((asset) => asset.state !== 'uploaded' || asset.size <= 0 ||
        !/^sha256:[a-f0-9]{64}$/.test(asset.digest))) {
    throw new Error('Release附件或完整性元数据与本次配置不一致，停止发布。');
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
  console.log(`\n[2/3] 等待实机验收：${draft.html_url}`);
  console.log('保持终端打开，从草稿实际下载，完成所有所选平台的安装、系统授权和退出恢复。');
  if (!await confirm({ message: '实机验收全部通过，现在Publish？', default: true })) {
    console.log(`保留草稿，未Publish：${draft.html_url}`);
    return;
  }
  const checked = readRelease(plan, context);
  if (!checked.draft || artifactFingerprint(checked) !== artifactFingerprint(draft)) {
    throw new Error('验收期间草稿或附件发生变化，未Publish，请重新核对和验收。');
  }
  console.log('[3/3] Publish Release');
  runCommand('gh', ['release', 'edit', plan.tag, '--repo', context.repository, '--draft=false']);
  const published = readRelease(plan, context);
  if (published.draft) throw new Error('GitHub尚未确认发布成功，请检查页面，不要重复发版。');
  console.log(`发布完成：${published.html_url}`);
}

async function main() {
  const { values } = parseArgs({
    options: { help: { type: 'boolean', short: 'h' } },
    allowPositionals: false,
  });
  if (values.help) {
    console.log('npm run release');
    console.log('最近10个commit / 输入hash → 版本与目标 → 固定SHA的CI构建和草稿 → 实机验收确认 → Publish');
    console.log('本地工作区可以保留未提交修改。完整步骤：architecture/release-guide.md');
    return;
  }
  console.log('\nInterceptor 按commit发版');
  console.log('↑/↓选择，Space勾选，Enter确认，Ctrl+C退出；本地文件和Git状态不会被修改。\n');
  const repository = readGitHubRepository();
  const selected = await chooseCommit(repository);
  captureCommand('gh', ['--version']);
  captureCommand('gh', ['auth', 'status', '--hostname', 'github.com']);
  const repositoryInfo = JSON.parse(captureCommand('gh', [
    'repo', 'view', repository, '--json', 'defaultBranchRef',
  ]));
  let source;
  try {
    source = readRemoteCommit(repository, selected.sha);
  } catch (error) {
    throw new Error(`无法从GitHub读取所选commit ${selected.sha}。请确认已推送及访问权限；不会自动push或改用main。\n${error.message}`, { cause: error });
  }
  if (source.sha !== selected.sha) throw new Error('GitHub返回的源码SHA与选择不一致。');
  const tags = readRemoteTags(repository);
  const plan = await choosePlan(source, readCommittedVersion(repository, source.sha), tags);
  const context = { repository, workflowRef: repositoryInfo.defaultBranchRef.name };
  printPlan(plan, context, source);
  if (!await confirm({ message: '按此源码commit开始发版？', default: true })) {
    console.log('已取消；仅查询了提交信息，没有修改本地文件或发起CI、tag、发布操作。');
    return;
  }
  if (readRemoteTags(repository).some((tag) => versionFromTag(tag) === plan.version)) {
    throw new Error(`${plan.version} 已存在，请选择新版本；不会删除或覆盖tag。`);
  }
  console.log(`[1/3] 提交CI：源码 ${plan.sourceSha}`);
  await runCi(plan, context);
  await publishAfterAcceptance(plan, context);
}

try {
  await main();
} catch (error) {
  if (error instanceof Error && error.name === 'ExitPromptError') {
    console.log('\n已取消本地操作；已启动的远端运行不会自动取消。');
    process.exitCode = 130;
  } else {
    console.error(`\n[release] ${error instanceof Error ? error.message : String(error)}`);
    console.error('本地文件、index和HEAD未被发版命令修改。恢复步骤见architecture/release-guide.md。');
    process.exitCode = 1;
  }
}
