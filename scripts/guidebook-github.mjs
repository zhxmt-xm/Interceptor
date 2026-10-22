import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

export const homepageRepository = 'zhxmt-xm/Interceptor-Homepage';
export const homepageBranch = 'main';
const endpoint = `repos/${homepageRepository}`;

export function gitBlobSha(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

export function githubApi(resource, method = 'GET', body) {
  try {
    const text = execFileSync('gh', [
      'api', '--hostname', 'github.com', resource, '--method', method,
      '-H', 'Accept: application/vnd.github+json',
      '-H', 'X-GitHub-Api-Version: 2022-11-28',
      ...(body === undefined ? [] : ['--input', '-']),
    ], {
      encoding: 'utf8', input: body === undefined ? undefined : JSON.stringify(body),
      maxBuffer: 32 * 1024 * 1024, timeout: 120_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return text.trim() ? JSON.parse(text) : null;
  } catch (error) {
    const detail = String(error.stderr ?? error.message).trim();
    throw new Error(`GitHub ${method} ${resource} failed: ${detail}\nUse gh auth login with access to ${homepageRepository}; no branch was force-updated.`, { cause: error });
  }
}

export function readHomepageHead() {
  const ref = githubApi(`${endpoint}/git/ref/heads/${homepageBranch}`);
  if (!/^[a-f0-9]{40}$/.test(ref?.object?.sha)) throw new Error('Homepage main has no valid commit.');
  return ref.object.sha;
}

export function readHomepageSnapshot() {
  const repository = githubApi(endpoint);
  if (repository.full_name !== homepageRepository || !repository.permissions?.push) {
    throw new Error(`The current gh account cannot write ${homepageRepository}.`);
  }
  const head = readHomepageHead();
  const commit = githubApi(`${endpoint}/git/commits/${head}`);
  const tree = githubApi(`${endpoint}/git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.truncated || !Array.isArray(tree.tree)) throw new Error('GitHub returned an incomplete Homepage file tree.');
  const entries = new Map(tree.tree.map(entry => [entry.path, entry]));
  const blobs = new Map();
  const readFile = file => {
    const entry = entries.get(file);
    if (!entry || entry.type !== 'blob' || entry.mode !== '100644') {
      throw new Error(`Homepage publication requires an existing regular file: ${file}`);
    }
    if (!blobs.has(entry.sha)) {
      const blob = githubApi(`${endpoint}/git/blobs/${entry.sha}`);
      if (blob.encoding !== 'base64' || blob.sha !== entry.sha) throw new Error(`Invalid GitHub blob: ${file}`);
      const bytes = Buffer.from(blob.content.replace(/\s/g, ''), 'base64');
      if (bytes.length !== blob.size || gitBlobSha(bytes) !== entry.sha) throw new Error(`GitHub file digest mismatch: ${file}`);
      blobs.set(entry.sha, bytes);
    }
    return blobs.get(entry.sha);
  };
  return { head, tree: commit.tree.sha, entries, readFile };
}

export async function publishHomepageChanges(snapshot, changes, report, saveReport, message) {
  if (typeof message !== 'string' || message.trim().length === 0) throw new Error('A publication commit message is required.');
  if (report.commit && readHomepageHead() === report.commit) {
    report.state = 'pushed';
    await saveReport();
    return report.commit;
  }
  if (readHomepageHead() !== snapshot.head) {
    throw new Error('Homepage main changed during capture. Nothing was updated; reconcile the new mapping before another run.');
  }
  const available = new Set([...snapshot.entries.values()].filter(entry => entry.type === 'blob').map(entry => entry.sha));
  const uploaded = new Set(report.uploadedBlobs ?? []);
  const tree = [];
  const updates = [...changes].filter(([file, content]) => content.sha !== snapshot.entries.get(file)?.sha);
  report.state = 'uploading';
  await saveReport();
  let count = 0;
  for (const [file, content] of updates) {
    const entry = snapshot.entries.get(file);
    if (entry && (entry.type !== 'blob' || entry.mode !== '100644')) throw new Error(`Remote target is not a regular file: ${file}`);
    const bytes = await content.read();
    const sha = gitBlobSha(bytes);
    if (sha !== content.sha) throw new Error(`Generated content changed before upload: ${file}`);
    if (sha === entry?.sha) continue;
    if (!available.has(sha) && !uploaded.has(sha)) {
      const result = githubApi(`${endpoint}/git/blobs`, 'POST', { encoding: 'base64', content: bytes.toString('base64') });
      if (result.sha !== sha) throw new Error(`Uploaded blob digest mismatch: ${file}`);
      uploaded.add(sha);
      report.uploadedBlobs = [...uploaded];
      await saveReport();
      await setTimeout(1_000);
    }
    tree.push({ path: file, mode: '100644', type: 'blob', sha });
    count++;
    if (count % 25 === 0 || count === updates.length) console.log(`已准备 ${count}/${updates.length} 个远端文件；Homepage main 尚未改变。`);
  }
  if (tree.length === 0) {
    report.state = 'unchanged';
    await saveReport();
    return null;
  }
  if (readHomepageHead() !== snapshot.head) throw new Error('Homepage main changed while uploading; no commit was published.');
  const candidate = githubApi(`${endpoint}/git/trees`, 'POST', { base_tree: snapshot.tree, tree });
  const commit = githubApi(`${endpoint}/git/commits`, 'POST', {
    message,
    tree: candidate.sha,
    parents: [snapshot.head],
  });
  if (commit.parents?.length !== 1 || commit.parents[0].sha !== snapshot.head || commit.tree?.sha !== candidate.sha) {
    throw new Error('GitHub created an unexpected candidate commit; main was not changed.');
  }
  report.commit = commit.sha;
  report.changedFiles = tree.map(entry => entry.path);
  report.state = 'committed-without-ref';
  await saveReport();
  if (readHomepageHead() !== snapshot.head) throw new Error(`Homepage main changed; candidate ${commit.sha} was not published.`);
  githubApi(`${endpoint}/git/refs/heads/${homepageBranch}`, 'PATCH', { sha: commit.sha, force: false });
  if (readHomepageHead() !== commit.sha) throw new Error('Homepage main does not point to the generated commit; inspect the remote before retrying.');
  report.state = 'pushed';
  report.websiteChecks = 'The existing Check website workflow runs after this main update; it is not awaited by this command.';
  await saveReport();
  return commit.sha;
}
