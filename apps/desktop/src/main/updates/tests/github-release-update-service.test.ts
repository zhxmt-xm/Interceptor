import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GitHubReleaseUpdateService } from '../github-release-update-service';

describe('GitHubReleaseUpdateService', () => {
  /** Temporary download roots removed after every test. */
  const roots: string[] = [];

  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
    roots.length = 0;
  });

  it('downloads a newer installer on demand and opens only the completed file', async () => {
    const fixture = await GitHubReleaseFixture.create(roots, {
      tagName: 'v0.1.1',
      body: '<b>Capture fixes</b>\n\nDownload is user controlled.',
    });
    const states: string[] = [];
    fixture.gitHubReleaseUpdateService.onStatusChange((status) => states.push(status.state));

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({
      state: 'available',
      latestVersion: '0.1.1',
      releaseNotes: 'Capture fixes\n\nDownload is user controlled.',
      totalBytes: fixture.installer.length,
    });
    expect(await fixture.gitHubReleaseUpdateService.download()).toMatchObject({
      state: 'downloaded',
      progress: 1,
      downloadedBytes: fixture.installer.length,
    });
    await fixture.gitHubReleaseUpdateService.openDownloaded();

    const installerPath = path.join(
      fixture.root,
      'updates/downloads/Interceptor.msi',
    );
    expect(await readFile(installerPath)).toEqual(fixture.installer);
    expect(fixture.openPath).toHaveBeenCalledWith(installerPath);
    expect(states).toContain('downloading');
    expect(states.at(-1)).toBe('downloaded');
  });

  it('selects and downloads the matching macOS DMG', async () => {
    const fixture = await GitHubReleaseFixture.create(roots, {
      platform: 'darwin',
      architecture: 'arm64',
      assetName: 'Interceptor-0.1.1-arm64.dmg',
    });

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({ state: 'available' });
    expect(await fixture.gitHubReleaseUpdateService.download()).toMatchObject({ state: 'downloaded' });
    expect(await readFile(path.join(
      fixture.root,
      'updates/downloads/Interceptor-0.1.1-arm64.dmg',
    ))).toEqual(fixture.installer);
  });

  it('reports the latest stable version without downloading when already current', async () => {
    const fixture = await GitHubReleaseFixture.create(roots, {
      tagName: '0.1.0',
      body: null,
    });

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({
      state: 'up-to-date',
      latestVersion: '0.1.0',
      releaseNotes: null,
    });
    await expect(fixture.gitHubReleaseUpdateService.download()).rejects.toThrow('No GitHub');
    await expect(fixture.gitHubReleaseUpdateService.openDownloaded()).rejects.toThrow('No downloaded');
  });

  it('treats a repository without releases as current', async () => {
    const fixture = await GitHubReleaseFixture.create(roots, { status: 404 });

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({
      state: 'up-to-date',
      latestVersion: null,
      message: 'No public stable release has been published yet.',
    });
  });

  it('removes an installer left by a previous application process', async () => {
    const fixture = await GitHubReleaseFixture.create(roots, { tagName: 'v0.1.0' });
    const stalePath = path.join(fixture.root, 'updates/downloads/Interceptor.msi');
    await mkdir(path.dirname(stalePath), { recursive: true });
    await writeFile(stalePath, 'stale');

    await fixture.gitHubReleaseUpdateService.check();

    await expect(access(stalePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects malformed release tags and foreign installer URLs', async () => {
    const invalidTag = await GitHubReleaseFixture.create(roots, {
      tagName: '../latest',
    });
    expect(await invalidTag.gitHubReleaseUpdateService.check()).toMatchObject({ state: 'failed' });

    const foreignAsset = await GitHubReleaseFixture.create(roots, {
      assetUrl: 'https://example.com/Interceptor.msi',
    });
    expect(await foreignAsset.gitHubReleaseUpdateService.check()).toMatchObject({ state: 'failed' });
    expect(foreignAsset.openPath).not.toHaveBeenCalled();
  });

  it('rejects an installer explicitly built for another architecture', async () => {
    const fixture = await GitHubReleaseFixture.create(roots, {
      assetName: 'Interceptor-arm64.msi',
    });

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({ state: 'failed' });
  });

  it('rejects an installer without a GitHub SHA-256 digest', async () => {
    const fixture = await GitHubReleaseFixture.create(roots, { digest: null });

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({ state: 'failed' });
  });

  it('rejects truncated or hash-mismatched installer downloads', async () => {
    const truncated = await GitHubReleaseFixture.create(roots, {
      downloadBody: Buffer.from('short'),
    });
    await truncated.gitHubReleaseUpdateService.check();
    expect(await truncated.gitHubReleaseUpdateService.download()).toMatchObject({ state: 'failed' });

    const mismatched = await GitHubReleaseFixture.create(roots, {
      digest: `sha256:${'0'.repeat(64)}`,
    });
    await mismatched.gitHubReleaseUpdateService.check();
    expect(await mismatched.gitHubReleaseUpdateService.download()).toMatchObject({ state: 'failed' });
    expect(mismatched.openPath).not.toHaveBeenCalled();
  });

  it('reports download-directory failures without remaining busy', async () => {
    const fixture = await GitHubReleaseFixture.create(roots);
    await fixture.gitHubReleaseUpdateService.check();
    await writeFile(path.join(fixture.root, 'updates'), 'blocks-directory');

    expect(await fixture.gitHubReleaseUpdateService.download()).toMatchObject({
      state: 'failed',
      progress: null,
      downloadedBytes: null,
    });
  });

  it('does not access GitHub outside packaged Windows and macOS builds', async () => {
    const fixture = await GitHubReleaseFixture.create(roots, { packaged: false });

    fixture.gitHubReleaseUpdateService.start();
    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({
      supported: false,
      state: 'unsupported',
    });
    expect(fixture.fetcher).not.toHaveBeenCalled();
  });

  it('checks on startup and then once per hour', async () => {
    vi.useFakeTimers({ toFake: ['setInterval'] });
    const fixture = await GitHubReleaseFixture.create(roots, { tagName: 'v0.1.0' });

    fixture.gitHubReleaseUpdateService.start();
    await vi.waitFor(() => expect(fixture.metadataRequests()).toBe(1));
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    await vi.waitFor(() => expect(fixture.metadataRequests()).toBe(2));
    fixture.gitHubReleaseUpdateService.stop();
  });
});

interface GitHubReleaseFixtureOptions {
  readonly status?: number;
  readonly tagName?: string;
  readonly body?: string | null;
  readonly packaged?: boolean;
  readonly assetUrl?: string;
  readonly assetName?: string;
  readonly digest?: string | null;
  readonly downloadBody?: Buffer;
  readonly platform?: NodeJS.Platform;
  readonly architecture?: NodeJS.Architecture;
}

/** Isolated fake GitHub API and installer source for update service tests. */
class GitHubReleaseFixture {
  /** Fixed fake installer bytes advertised by release metadata. */
  readonly installer = Buffer.from('signed Interceptor installer bytes');
  /** Temporary application data root. */
  readonly root: string;
  /** Fake fetch dispatcher for metadata and asset requests. */
  readonly fetcher: ReturnType<typeof vi.fn>;
  /** Fake operating-system installer opener. */
  readonly openPath = vi.fn(async () => '');
  /** Service under test. */
  readonly gitHubReleaseUpdateService: GitHubReleaseUpdateService;
  /** Captured request URLs. */
  private readonly requests: string[] = [];

  /** Bind one complete test fixture. */
  private constructor(
    root: string,
    options: GitHubReleaseFixtureOptions,
  ) {
    this.root = root;
    const tagName = options.tagName ?? 'v0.1.1';
    const assetName = options.assetName ?? 'Interceptor.msi';
    const assetUrl = options.assetUrl ??
      `https://github.com/zhxmt-xm/Interceptor/releases/download/${tagName}/${assetName}`;
    const digest = options.digest === undefined
      ? `sha256:${createHash('sha256').update(this.installer).digest('hex')}`
      : options.digest;
    const metadata = options.status === 404
      ? new Response('missing', { status: 404 })
      : Response.json({
          tag_name: tagName,
          draft: false,
          prerelease: false,
          body: options.body ?? '',
          assets: [{
            name: assetName,
            browser_download_url: assetUrl,
            state: 'uploaded',
            size: this.installer.length,
            digest,
          }],
        });
    const downloadBody = options.downloadBody ?? this.installer;
    this.fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      this.requests.push(url);
      if (url.includes('/releases/latest')) {
        return metadata.clone();
      }
      return new Response(new Uint8Array(downloadBody), {
        status: 200,
        headers: { 'content-length': String(downloadBody.length) },
      });
    });
    this.gitHubReleaseUpdateService = new GitHubReleaseUpdateService({
      platform: options.platform ?? 'win32',
      architecture: options.architecture ?? 'x64',
      packaged: options.packaged ?? true,
      currentVersion: '0.1.0',
      dataDirectory: root,
      diagnostics: { info: vi.fn(), error: vi.fn() },
      fetcher: this.fetcher as unknown as typeof fetch,
      openPath: this.openPath,
      now: () => new Date('2026-07-18T00:00:00.000Z'),
    });
  }

  /** Create one temporary fixture and register its root for cleanup. */
  static async create(
    roots: string[],
    options: GitHubReleaseFixtureOptions = {},
  ): Promise<GitHubReleaseFixture> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'interceptor-github-update-'));
    roots.push(root);
    return new GitHubReleaseFixture(root, options);
  }

  /** Count only GitHub latest-release metadata requests. */
  metadataRequests(): number {
    return this.requests.filter((url) => url.includes('/releases/latest')).length;
  }
}
