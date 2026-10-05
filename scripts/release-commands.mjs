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

export function readGit(args) {
  return captureCommand('git', args).trim();
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
