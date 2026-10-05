import { captureCommand, readGit } from './release-commands.mjs';

function parseCommits(output) {
  const fields = output.split('\0');
  if (fields.at(-1) === '') fields.pop();
  if (fields.length % 3 !== 0) throw new Error('Git提交信息格式不完整。');
  const commits = [];
  for (let index = 0; index < fields.length; index += 3) {
    const sha = fields[index].trim();
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Git未返回完整commit SHA。');
    commits.push({
      sha,
      date: fields[index + 1].trim(),
      subject: fields[index + 2].replace(/[\u0000-\u001f\u007f]/g, ' '),
    });
  }
  return commits;
}

export function readRecentCommits() {
  return parseCommits(captureCommand('git', [
    'log', '-10', '-z', '--format=%H%x00%cs%x00%s', 'HEAD',
  ]));
}

export function readRemoteCommit(repository, hash) {
  if (!/^[a-f0-9]{4,40}$/i.test(hash)) throw new Error('请输入4至40位十六进制commit hash，不是分支或tag名称。');
  const commit = JSON.parse(captureCommand('gh', [
    'api', `repos/${repository}/commits/${hash.toLowerCase()}`,
    '--jq', '{sha: .sha, date: .commit.committer.date, subject: (.commit.message | split("\\n")[0])}',
  ]));
  if (!/^[a-f0-9]{40}$/.test(commit.sha) ||
      typeof commit.date !== 'string' || typeof commit.subject !== 'string') {
    throw new Error('GitHub未返回有效的commit信息。');
  }
  return {
    sha: commit.sha,
    date: commit.date,
    subject: commit.subject.replace(/[\u0000-\u001f\u007f]/g, ' '),
  };
}

export function findCommitByHash(repository, value) {
  const hash = value.trim().toLowerCase();
  if (!/^[a-f0-9]{4,40}$/.test(hash)) throw new Error('请输入4至40位十六进制commit hash。');
  const objects = readGit(['rev-parse', `--disambiguate=${hash}`]).split(/\s+/).filter(Boolean);
  const commits = objects.filter((sha) => readGit(['cat-file', '-t', sha]) === 'commit');
  if (commits.length > 1) throw new Error('这个短hash匹配多个commit，请输入更长的hash。');
  if (commits.length === 1) {
    return parseCommits(captureCommand('git', [
      'show', '-s', '-z', '--format=%H%x00%cs%x00%s', commits[0],
    ]))[0];
  }
  if (objects.length > 0) throw new Error('这个hash指向的不是commit，不能用作发版源码。');
  console.log('本地未找到该hash，正在查询当前GitHub仓库。');
  return readRemoteCommit(repository, hash);
}

export function readCommittedVersion(repository, sha) {
  const file = JSON.parse(captureCommand('gh', [
    'api', `repos/${repository}/contents/apps/desktop/package.json?ref=${sha}`,
  ]));
  if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string') {
    throw new Error('所选commit没有可读取的Desktop package.json。');
  }
  return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')).version;
}

export function readRemoteTags(repository) {
  return captureCommand('gh', [
    'api', '--paginate', `repos/${repository}/tags`, '--jq', '.[].name',
  ]).split('\n').map((tag) => tag.trim()).filter(Boolean);
}
