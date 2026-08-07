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
    expect(fixture.requestFor('/releases/latest')?.headers.get('authorization'))
      .toBe('Bearer ghu_test_token');
    const assetRequest = fixture.requestFor('/releases/assets/42');
    expect(assetRequest?.headers.get('authorization')).toBe('Bearer ghu_test_token');
    expect(assetRequest?.headers.get('accept')).toBe('application/octet-stream');
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

  it('reports missing or unauthorized private repositories', async () => {
    const fixture = await GitHubReleaseFixture.create(roots, { status: 404 });

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({
      state: 'failed',
      latestVersion: null,
      message: 'The private release repository was not found or is not authorized.',
    });
  });

  it('requires GitHub authorization before reading private releases', async () => {
    const fixture = await GitHubReleaseFixture.create(roots, { accessToken: null });

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({
      state: 'authentication-required',
      latestVersion: null,
    });
    expect(fixture.fetcher).not.toHaveBeenCalled();
  });

  it('ignores a release response started under an older authorization', async () => {
    const fixture = await GitHubReleaseFixture.create(roots);
    const releaseMetadata = fixture.pauseMetadata();

    const check = fixture.gitHubReleaseUpdateService.check();
    await vi.waitFor(() => expect(fixture.metadataRequests()).toBe(1));
    fixture.gitHubReleaseUpdateService.authorizationChanged(false);
    fixture.gitHubReleaseUpdateService.authorizationChanged(true);
    releaseMetadata();

    expect(await check).toMatchObject({ state: 'idle', latestVersion: null });
    expect(fixture.gitHubReleaseUpdateService.status()).toMatchObject({
      state: 'idle',
      latestVersion: null,
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
  readonly accessToken?: string | null;
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
  /** Captured requests and security-relevant headers. */
  private readonly requests: Array<{ url: string; headers: Headers }> = [];
  /** Optional gate for an in-flight metadata response. */
  private metadataGate: Promise<void> | null = null;

  /** Bind one complete test fixture. */
  private constructor(
    root: string,
    options: GitHubReleaseFixtureOptions,
  ) {
    this.root = root;
    const tagName = options.tagName ?? 'v0.1.1';
    const assetName = options.assetName ?? 'Interceptor.msi';
    const assetUrl = options.assetUrl ??
      'https://api.github.com/repos/zhxmt-xm/Interceptor/releases/assets/42';
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
            id: 42,
            name: assetName,
            url: assetUrl,
            state: 'uploaded',
            size: this.installer.length,
            digest,
          }],
        });
    const downloadBody = options.downloadBody ?? this.installer;
    this.fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      this.requests.push({ url, headers: new Headers(init?.headers) });
      if (url.includes('/releases/latest')) {
        if (this.metadataGate) {
          await this.metadataGate;
        }
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
      getAccessToken: async () => options.accessToken === undefined
        ? 'ghu_test_token'
        : options.accessToken,
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
    return this.requests.filter((request) => request.url.includes('/releases/latest')).length;
  }

  /** Return one captured request matching a fixed URL fragment. */
  requestFor(fragment: string): { url: string; headers: Headers } | undefined {
    return this.requests.find((request) => request.url.includes(fragment));
  }

  /** Pause the next metadata response until the returned function is called. */
  pauseMetadata(): () => void {
    let release = (): void => undefined;
    this.metadataGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => {
      this.metadataGate = null;
      release();
    };
  }
}
