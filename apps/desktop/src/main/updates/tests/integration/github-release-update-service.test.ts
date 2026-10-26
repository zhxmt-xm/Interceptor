import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GitHubReleaseUpdateService } from '../../github-release-update-service';

describe('GitHubReleaseUpdateService', () => {
  /** Temporary download roots removed after every test. */
  const roots: string[] = [];

  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
    roots.length = 0;
  });

  it.runIf(process.platform === 'win32')('downloads a newer installer on demand and opens only the completed file', async () => {
    const fixture = await GitHubReleaseFixture.create(roots, {
      tagName: 'v0.1.1-alpha.1',
      prerelease: true,
      currentVersion: '0.1.1-alpha.0',
      body: '<b>Capture fixes</b>\n\nDownload is user controlled.',
    });
    const states: string[] = [];
    fixture.gitHubReleaseUpdateService.onStatusChange((status) => states.push(status.state));

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({
      state: 'available',
      latestVersion: '0.1.1-alpha.1',
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
    expect(fixture.requestFor('/releases?')?.headers.get('authorization'))
      .toBeNull();
    const assetRequest = fixture.requestFor('/releases/assets/42');
    expect(assetRequest?.headers.get('authorization')).toBeNull();
    expect(assetRequest?.headers.get('accept')).toBe('application/octet-stream');
  });

  it.runIf(process.platform === 'darwin')('selects and downloads the matching macOS DMG', async () => {
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

  it('reports the highest published version without downloading when already current', async () => {
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

  it('selects alpha versions numerically from an unordered release list', async () => {
    const fixture = await GitHubReleaseFixture.create(roots, {
      currentVersion: '0.1.1-alpha.0',
      releasePages: [[
        { tagName: 'v0.1.1-alpha.2', prerelease: true },
        { tagName: 'v0.1.0' },
        { tagName: 'v0.1.1-alpha.10', prerelease: true },
      ]],
    });

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({
      state: 'available',
      latestVersion: '0.1.1-alpha.10',
    });
  });

  it('promotes an alpha to the same stable version and ignores draft and invalid tags', async () => {
    const fixture = await GitHubReleaseFixture.create(roots, {
      currentVersion: '0.1.1-alpha.10',
      releasePages: [[
        { tagName: 'v0.2.0', draft: true },
        { tagName: 'not-a-version' },
        { tagName: 'v0.1.1-alpha.10', prerelease: true },
        { tagName: 'v0.1.1' },
      ]],
    });

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({
      state: 'available',
      latestVersion: '0.1.1',
    });
  });

  it('offers an alpha with a higher base version to a stable installation', async () => {
    const fixture = await GitHubReleaseFixture.create(roots, {
      currentVersion: '0.1.1',
      tagName: 'v0.1.2-alpha.1',
      prerelease: true,
    });

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({
      state: 'available',
      latestVersion: '0.1.2-alpha.1',
    });
  });

  it.each(['0.1.1-alpha.1', '0.1.1-alpha.10', '0.1.1', '0.1.1-alpha.1+local'])
    ('does not offer an alpha downgrade or reinstall from %s', async (currentVersion) => {
      const fixture = await GitHubReleaseFixture.create(roots, {
        currentVersion,
        tagName: 'v0.1.1-alpha.1',
        prerelease: true,
      });

      expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({
        state: 'up-to-date',
        latestVersion: '0.1.1-alpha.1',
      });
      await expect(fixture.gitHubReleaseUpdateService.download()).rejects.toThrow('No GitHub');
    });

  it('finds the highest version on a later release page', async () => {
    const fixture = await GitHubReleaseFixture.create(roots, {
      currentVersion: '0.1.1-alpha.0',
      releasePages: [
        Array.from({ length: 100 }, () => ({ tagName: 'v0.1.1-alpha.2', prerelease: true })),
        [{ tagName: 'v0.1.1-alpha.10', prerelease: true }],
      ],
    });

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({
      state: 'available',
      latestVersion: '0.1.1-alpha.10',
    });
    expect(fixture.metadataRequests()).toBe(2);
    expect(fixture.requestFor('page=2')).toBeDefined();
  });

  it('fails instead of choosing an older version when the newest installer is unsafe', async () => {
    const fixture = await GitHubReleaseFixture.create(roots, {
      currentVersion: '0.1.1-alpha.0',
      releasePages: [[
        { tagName: 'v0.1.1-alpha.1', prerelease: true },
        { tagName: 'v0.1.1-alpha.10', prerelease: true, assetUrl: 'https://example.com/unsafe.msi' },
      ]],
    });

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({
      state: 'failed',
      latestVersion: null,
    });
    await expect(fixture.gitHubReleaseUpdateService.download()).rejects.toThrow('No GitHub');
  });

  it('fails when no published semantic version exists', async () => {
    const fixture = await GitHubReleaseFixture.create(roots, { releasePages: [[]] });

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({ state: 'failed' });
  });

  it('rejects a non-array release response', async () => {
    const fixture = await GitHubReleaseFixture.create(roots);
    fixture.fetcher.mockResolvedValueOnce(Response.json({ tag_name: 'v0.1.1' }));

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({ state: 'failed' });
  });

  it('does not publish a partial version selection when a later page fails', async () => {
    const fixture = await GitHubReleaseFixture.create(roots, {
      releasePages: [Array.from({ length: 100 }, () => ({ tagName: 'v0.1.1' }))],
    });
    const fetchMetadata = fixture.fetcher.getMockImplementation()!;
    fixture.fetcher.mockImplementationOnce(fetchMetadata)
      .mockResolvedValueOnce(new Response('request failed', { status: 500 }));

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({
      state: 'failed',
      latestVersion: null,
      message: 'GitHub returned HTTP 500.',
    });
  });

  it.each([401, 403, 404, 429, 500])('reports HTTP %s without requiring authorization', async (status) => {
    const fixture = await GitHubReleaseFixture.create(roots, { status });

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({
      state: 'failed',
      latestVersion: null,
      message: `GitHub returned HTTP ${status}.`,
    });
    expect(fixture.fetcher).toHaveBeenCalledOnce();
  });

  it('checks releases without GitHub authorization', async () => {
    const fixture = await GitHubReleaseFixture.create(roots);

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({
      state: 'available',
      latestVersion: '0.1.1',
    });
    expect(fixture.fetcher).toHaveBeenCalledWith(
      'https://api.github.com/repos/zhxmt-xm/Interceptor/releases?per_page=100&page=1',
      expect.objectContaining({ credentials: 'omit', redirect: 'error' }),
    );
  });

  it('reports a network failure and allows an explicit anonymous retry', async () => {
    const fixture = await GitHubReleaseFixture.create(roots);
    fixture.fetcher.mockRejectedValueOnce(new TypeError('fetch failed'));

    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({
      state: 'failed',
      message: 'fetch failed',
    });
    expect(await fixture.gitHubReleaseUpdateService.check()).toMatchObject({
      state: 'available',
      latestVersion: '0.1.1',
    });
  });

  it('ignores a release response received after shutdown', async () => {
    const fixture = await GitHubReleaseFixture.create(roots);
    const releaseMetadata = fixture.pauseMetadata();

    const check = fixture.gitHubReleaseUpdateService.check();
    await vi.waitFor(() => expect(fixture.metadataRequests()).toBe(1));
    fixture.gitHubReleaseUpdateService.stop();
    releaseMetadata();

    expect(await check).toMatchObject({ state: 'checking', latestVersion: null });
    expect(fixture.gitHubReleaseUpdateService.status()).toMatchObject({
      state: 'checking',
      latestVersion: null,
    });
  });

  it.each([404, 500])('reports asset HTTP %s without opening an installer', async (status) => {
    const fixture = await GitHubReleaseFixture.create(roots);
    await fixture.gitHubReleaseUpdateService.check();
    fixture.fetcher.mockResolvedValueOnce(new Response('request failed', { status }));

    expect(await fixture.gitHubReleaseUpdateService.download()).toMatchObject({
      state: 'failed',
      progress: null,
      message: `GitHub asset returned HTTP ${status}.`,
    });
    await expect(fixture.gitHubReleaseUpdateService.openDownloaded()).rejects.toThrow('No downloaded');
    expect(fixture.openPath).not.toHaveBeenCalled();
  });

  it('does not retain an installer response received after shutdown', async () => {
    const fixture = await GitHubReleaseFixture.create(roots);
    await fixture.gitHubReleaseUpdateService.check();
    let releaseAsset = (): void => undefined;
    const assetGate = new Promise<void>((resolve) => { releaseAsset = resolve; });
    fixture.fetcher.mockImplementationOnce(async () => {
      await assetGate;
      return new Response(new Uint8Array(fixture.installer), {
        headers: { 'content-length': String(fixture.installer.length) },
      });
    });

    const download = fixture.gitHubReleaseUpdateService.download();
    await vi.waitFor(() => expect(fixture.fetcher).toHaveBeenCalledTimes(2));
    fixture.gitHubReleaseUpdateService.stop();
    releaseAsset();

    expect(await download).toMatchObject({ state: 'downloading', downloadedBytes: 0 });
    await expect(fixture.gitHubReleaseUpdateService.openDownloaded()).rejects.toThrow('No downloaded');
    await expect(access(path.join(fixture.root, 'updates/downloads/Interceptor.msi')))
      .rejects.toMatchObject({ code: 'ENOENT' });
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

interface GitHubReleaseMetadataOptions {
  readonly tagName?: string;
  readonly body?: string | null;
  readonly draft?: boolean;
  readonly prerelease?: boolean;
  readonly assetUrl?: string;
  readonly assetName?: string;
  readonly digest?: string | null;
}

interface GitHubReleaseFixtureOptions extends GitHubReleaseMetadataOptions {
  readonly status?: number;
  readonly packaged?: boolean;
  readonly currentVersion?: string;
  readonly releasePages?: readonly (readonly GitHubReleaseMetadataOptions[])[];
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
    const pages = (options.releasePages ?? [[options]])
      .map((page) => page.map((release) => this.releaseMetadata(release)));
    const downloadBody = options.downloadBody ?? this.installer;
    this.fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      this.requests.push({ url, headers: new Headers(init?.headers) });
      const parsedUrl = new URL(url);
      if (parsedUrl.pathname === '/repos/zhxmt-xm/Interceptor/releases') {
        if (this.metadataGate) {
          await this.metadataGate;
        }
        if (options.status !== undefined) {
          return new Response('request failed', { status: options.status });
        }
        const page = Number(parsedUrl.searchParams.get('page') ?? '1');
        return Response.json(pages[page - 1] ?? []);
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
      currentVersion: options.currentVersion ?? '0.1.0',
      dataDirectory: root,
      diagnostics: { info: vi.fn(), error: vi.fn() },
      fetcher: this.fetcher as unknown as typeof fetch,
      openPath: this.openPath,
      now: () => new Date('2026-07-18T00:00:00.000Z'),
    });
  }

  /** Build public release metadata with installer bytes matching the fixture. */
  private releaseMetadata(options: GitHubReleaseMetadataOptions): Record<string, unknown> {
    return {
      tag_name: options.tagName ?? 'v0.1.1',
      draft: options.draft ?? false,
      prerelease: options.prerelease ?? false,
      body: options.body === undefined ? '' : options.body,
      assets: [{
        id: 42,
        name: options.assetName ?? 'Interceptor.msi',
        url: options.assetUrl ?? 'https://api.github.com/repos/zhxmt-xm/Interceptor/releases/assets/42',
        state: 'uploaded',
        size: this.installer.length,
        digest: options.digest === undefined
          ? `sha256:${createHash('sha256').update(this.installer).digest('hex')}`
          : options.digest,
      }],
    };
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

  /** Count only GitHub release metadata requests. */
  metadataRequests(): number {
    return this.requests.filter((request) => new URL(request.url).pathname === '/repos/zhxmt-xm/Interceptor/releases').length;
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
