import { execFileSync } from 'node:child_process';

import { repositoryRoot } from './release-config.mjs';

export function captureCommand(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw commandError(command, error);
  }
}

export function runCommand(command, args) {
  try {
    execFileSync(command, args, { cwd: repositoryRoot, stdio: 'inherit' });
  } catch (error) {
    throw commandError(command, error);
  }
}

function commandError(command, error) {
  if (error.code === 'ENOENT') {
    return new Error(`找不到 ${command}。请先安装该工具；GitHub CLI 的安装和登录步骤见 architecture/release-guide.md。`, { cause: error });
  }
  const detail = typeof error.stderr === 'string' ? error.stderr.trim() : '';
  return new Error(`${command} 执行失败（${error.signal ?? error.status ?? error.code ?? 'unknown'}）${detail ? `：\n${detail}` : '，请查看上面的错误输出。'}`, { cause: error });
}

export function runNpm(args) {
  if (!process.env.npm_execpath) {
    throw new Error('npm_execpath 不可用，请通过 npm run release 或 npm run release:build 启动。');
  }
  runCommand(process.execPath, [process.env.npm_execpath, ...args]);
}

export function readGit(args) {
  return captureCommand('git', args).trim();
}

export function requireCleanWorktree() {
  if (readGit(['status', '--porcelain'])) {
    throw new Error('工作区有未提交或未跟踪文件。请先审阅并提交业务代码；本流程只自动提交自己生成的版本/发版配置，不会夹带原有修改。');
  }
}

export function readGitHubRepository() {
  const remote = readGit(['remote', 'get-url', 'origin']);
  let repository;
  const ssh = /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote);
  if (ssh) {
    repository = ssh[1];
  } else {
    let url;
    try {
      url = new URL(remote);
    } catch {
      throw new Error('无法识别 origin。当前向导只支持 github.com 仓库。');
    }
    if (url.hostname === 'github.com' && ['https:', 'ssh:'].includes(url.protocol)) {
      repository = url.pathname.replace(/^\//, '').replace(/\.git$/, '');
    }
  }
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error('origin 必须指向 github.com 上的 owner/repository。');
  }
  return repository;
}

export function requirePushedCommit() {
  requireCleanWorktree();
  const branch = readGit(['symbolic-ref', '--short', 'HEAD']);
  const commit = readGit(['rev-parse', 'HEAD']);
  const remote = readGit(['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]);
  if (remote.split(/\s+/)[0] !== commit) {
    throw new Error('当前 commit 尚未与远端分支一致。请确认并执行 git push origin HEAD；若被拒绝，先处理分支差异，不要 force push。');
  }
  return { branch, commit };
}
