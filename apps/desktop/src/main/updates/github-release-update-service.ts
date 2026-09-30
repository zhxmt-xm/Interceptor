import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import semver from 'semver';

import type { UpdateStatus } from '../../shared/desktop-api';
import type {
  GitHubReleaseAsset,
  GitHubReleaseUpdateDiagnostics,
  GitHubReleaseUpdateServiceOptions,
  UpdateService,
} from '../interfaces';

/** Checks and manually downloads installers anonymously from one fixed GitHub repository. */
export class GitHubReleaseUpdateService implements UpdateService {
  /** Fixed repository API endpoint; no Renderer-controlled URL is accepted. */
  private static readonly latestReleaseApi =
    'https://api.github.com/repos/zhxmt-xm/Interceptor/releases/latest';
  /** Current immutable status exposed through the narrow desktop API. */
  private statusValue: UpdateStatus;
  /** Status subscribers owned by Main. */
  private readonly listeners = new Set<(status: UpdateStatus) => void>();
  /** Structured diagnostics sink without release-note content. */
  private readonly diagnostics: GitHubReleaseUpdateDiagnostics;
  /** Injectable fetch implementation for deterministic tests. */
  private readonly fetcher: typeof fetch;
  /** Opens one downloaded installer through the operating system. */
  private readonly openPath: (filePath: string) => Promise<string>;
  /** Fixed private directory for transient installer downloads. */
  private readonly downloadDirectory: string;
  /** Host platform used to select exactly one installer asset. */
  private readonly platform: NodeJS.Platform;
  /** Host architecture used to disambiguate multi-architecture assets. */
  private readonly architecture: NodeJS.Architecture;
  /** Time source for check timestamps. */
  private readonly now: () => Date;
  /** Whether this packaged platform has supported release artifacts. */
  private readonly supportedValue: boolean;
  /** Validated installer retained only while a newer release is available. */
  private availableAsset: GitHubReleaseAsset | null = null;
  /** Installer path retained only after a complete verified download. */
  private downloadedInstallerPath: string | null = null;
  /** Deduplicates simultaneous startup/manual checks. */
  private operation: Promise<UpdateStatus> | null = null;
  /** Hourly release check timer. */
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  /** Active download cancellation owned by application shutdown. */
  private downloadAbortController: AbortController | null = null;
  /** Active release-check cancellation owned by application shutdown. */
  private checkAbortController: AbortController | null = null;

  /** Bind the checker to immutable package metadata and trusted Main callbacks. */
  constructor(options: GitHubReleaseUpdateServiceOptions) {
    this.diagnostics = options.diagnostics;
    this.fetcher = options.fetcher ?? fetch;
    this.openPath = options.openPath;
    this.downloadDirectory = path.join(options.dataDirectory, 'updates/downloads');
    this.now = options.now ?? (() => new Date());
    this.platform = options.platform ?? process.platform;
    this.architecture = options.architecture ?? process.arch;
    this.supportedValue = options.packaged &&
      (this.platform === 'win32' || this.platform === 'darwin');
    this.statusValue = {
      supported: this.supportedValue,
      state: this.supportedValue ? 'idle' : 'unsupported',
      currentVersion: options.currentVersion,
      latestVersion: null,
      progress: null,
      downloadedBytes: null,
      totalBytes: null,
      releaseNotes: null,
      message: this.supportedValue
        ? 'Downloads start only when you choose.'
        : 'Release checks run only in packaged Windows and macOS builds.',
      lastCheckedAt: null,
    };
  }

  /** Check once at startup and then hourly without automatically downloading. */
  start(): void {
    if (!this.supportedValue || this.checkTimer) {
      return;
    }
    void this.check();
    this.checkTimer = setInterval(() => {
      if (
        this.statusValue.state !== 'downloading' &&
        this.statusValue.state !== 'downloaded'
      ) {
        void this.check();
      }
    }, 60 * 60_000);
  }

  /** Return a detached public status snapshot. */
  status(): UpdateStatus {
    return { ...this.statusValue };
  }

  /** Check the latest stable GitHub Release without account credentials. */
  check(): Promise<UpdateStatus> {
    if (!this.supportedValue) {
      return Promise.resolve(this.status());
    }
    if (this.operation) {
      return this.operation;
    }
    this.operation = this.checkInternal().finally(() => {
      this.operation = null;
    });
    return this.operation;
  }

  /** Download the selected platform installer after explicit user action. */
  download(): Promise<UpdateStatus> {
    if (
      this.operation ||
      this.statusValue.state !== 'available' ||
      !this.availableAsset ||
      !this.statusValue.latestVersion
    ) {
      return Promise.reject(new Error('No GitHub Release installer is available.'));
    }
    this.operation = this.downloadInternal(
      this.availableAsset,
      this.statusValue.latestVersion,
    ).finally(() => {
      this.operation = null;
    });
    return this.operation;
  }

  /** Open the completely downloaded installer through the operating system. */
  async openDownloaded(): Promise<void> {
    if (this.statusValue.state !== 'downloaded' || !this.downloadedInstallerPath) {
      throw new Error('No downloaded installer is ready to open.');
    }
    const error = await this.openPath(this.downloadedInstallerPath);
    if (error) {
      throw new Error(error);
    }
  }

  /** Subscribe to status changes and return an explicit unsubscribe function. */
  onStatusChange(listener: (status: UpdateStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Stop periodic checks and detach Main subscribers. */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    this.downloadAbortController?.abort();
    this.downloadAbortController = null;
    this.checkAbortController?.abort();
    this.checkAbortController = null;
    this.listeners.clear();
  }

  /** Fetch, validate and compare one release without downloading it. */
  private async checkInternal(): Promise<UpdateStatus> {
    this.availableAsset = null;
    this.downloadedInstallerPath = null;
    this.transition({
      state: 'checking',
      latestVersion: null,
      progress: null,
      downloadedBytes: null,
      totalBytes: null,
      releaseNotes: null,
      message: 'Checking GitHub Releases…',
      lastCheckedAt: this.now().toISOString(),
    });
    const abortController = new AbortController();
    this.checkAbortController = abortController;
    try {
      await rm(this.downloadDirectory, { recursive: true, force: true });
      abortController.signal.throwIfAborted();
      const response = await this.fetcher(
        GitHubReleaseUpdateService.latestReleaseApi,
        {
          method: 'GET',
          headers: {
            accept: 'application/vnd.github+json',
            'x-github-api-version': '2026-03-10',
          },
          redirect: 'error',
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          signal: abortController.signal,
        },
      );
      abortController.signal.throwIfAborted();
      if (!response.ok) {
        throw new Error(`GitHub returned HTTP ${response.status}.`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      abortController.signal.throwIfAborted();
      const release = this.parseRelease(new TextDecoder().decode(bytes));
      const currentVersion = this.statusValue.currentVersion;
      if (semver.gt(release.version, currentVersion)) {
        this.availableAsset = release.asset;
        this.transition({
          state: 'available',
          latestVersion: release.version,
          totalBytes: release.asset.size,
          releaseNotes: release.notes,
          message: 'A newer installer is available from GitHub Releases.',
        });
      } else {
        this.transition({
          state: 'up-to-date',
          latestVersion: release.version,
          message: 'Interceptor is up to date.',
        });
      }
      this.diagnostics.info('main.update.github.check.completed', {
        outcome: 'success',
      });
      return this.status();
    } catch (error) {
      if (abortController.signal.aborted) {
        return this.status();
      }
      this.diagnostics.error('main.update.github.check.failed', {
        errorCode: error instanceof Error ? error.name : 'Error',
        outcome: 'failed',
      });
      this.transition({
        state: 'failed',
        latestVersion: null,
        progress: null,
        downloadedBytes: null,
        totalBytes: null,
        releaseNotes: null,
        message: error instanceof Error ? error.message : String(error),
      });
      return this.status();
    } finally {
      this.checkAbortController = null;
    }
  }

  /** Stream one installer to a private temporary directory with bounded progress. */
  private async downloadInternal(
    asset: GitHubReleaseAsset,
    version: string,
  ): Promise<UpdateStatus> {
    this.transition({
      state: 'downloading',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: asset.size,
      message: 'Downloading the signed installer from GitHub Releases…',
    });
    const temporaryPath = path.join(
      this.downloadDirectory,
      `.${asset.name}.${randomUUID()}.part`,
    );
    const finalPath = path.join(this.downloadDirectory, asset.name);
    const abortController = new AbortController();
    this.downloadAbortController = abortController;
    try {
      await rm(this.downloadDirectory, { recursive: true, force: true });
      await mkdir(this.downloadDirectory, { recursive: true });
      abortController.signal.throwIfAborted();
      const response = await this.fetcher(asset.url, {
        method: 'GET',
        headers: {
          accept: 'application/octet-stream',
          'x-github-api-version': '2026-03-10',
        },
        redirect: 'follow',
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: abortController.signal,
      });
      abortController.signal.throwIfAborted();
      if (!response.ok || !response.body) {
        throw new Error(`GitHub asset returned HTTP ${response.status}.`);
      }
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared !== asset.size) {
        throw new Error('GitHub installer size does not match release metadata.');
      }
      const handle = await open(temporaryPath, 'wx', 0o600);
      const digest = createHash('sha256');
      const reader = response.body.getReader();
      let received = 0;
      let lastProgress = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          abortController.signal.throwIfAborted();
          if (done) {
            break;
          }
          received += value.byteLength;
          if (received > asset.size) {
            throw new Error('GitHub installer exceeds its declared size.');
          }
          digest.update(value);
          let offset = 0;
          while (offset < value.byteLength) {
            const { bytesWritten } = await handle.write(
              value,
              offset,
              value.byteLength - offset,
            );
            if (bytesWritten === 0) {
              throw new Error('Unable to write the GitHub installer.');
            }
            offset += bytesWritten;
          }
          abortController.signal.throwIfAborted();
          const progress = received / asset.size;
          if (progress - lastProgress >= 0.01 || received === asset.size) {
            lastProgress = progress;
            this.transition({ progress, downloadedBytes: received });
          }
        }
        await handle.sync();
      } finally {
        reader.releaseLock();
        await handle.close();
      }
      if (received !== asset.size) {
        throw new Error('GitHub installer download is incomplete.');
      }
      if (digest.digest('hex') !== asset.sha256) {
        throw new Error('GitHub installer SHA-256 does not match release metadata.');
      }
      abortController.signal.throwIfAborted();
      await rename(temporaryPath, finalPath);
      if (abortController.signal.aborted) {
        await rm(finalPath, { force: true });
        return this.status();
      }
      this.downloadedInstallerPath = finalPath;
      this.transition({
        state: 'downloaded',
        progress: 1,
        downloadedBytes: asset.size,
        message: `Interceptor ${version} is downloaded and ready to open.`,
      });
      return this.status();
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      if (abortController.signal.aborted) {
        return this.status();
      }
      this.diagnostics.error('main.update.github.download.failed', {
        errorCode: error instanceof Error ? error.name : 'Error',
        outcome: 'failed',
      });
      this.transition({
        state: 'failed',
        progress: null,
        downloadedBytes: null,
        message: error instanceof Error ? error.message : String(error),
      });
      return this.status();
    } finally {
      this.downloadAbortController = null;
    }
  }

  /** Parse only the GitHub fields required for changelog and installer download. */
  private parseRelease(text: string): {
    version: string;
    notes: string | null;
    asset: GitHubReleaseAsset;
  } {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error('GitHub release metadata is not valid JSON.');
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('GitHub release metadata is invalid.');
    }
    const release = value as Record<string, unknown>;
    if (
      typeof release.tag_name !== 'string' ||
      release.draft !== false ||
      release.prerelease !== false ||
      !(typeof release.body === 'string' || release.body === null) ||
      !Array.isArray(release.assets)
    ) {
      throw new Error('GitHub release metadata fields are invalid.');
    }
    const version = release.tag_name.startsWith('v')
      ? release.tag_name.slice(1)
      : release.tag_name;
    if (!semver.valid(version)) {
      throw new Error('GitHub release tag is not a semantic version.');
    }
    return {
      version,
      notes: this.plainText(release.body ?? ''),
      asset: this.selectAsset(release.tag_name, release.assets),
    };
  }

  /** Select exactly one safe MSI/DMG for the current platform and architecture. */
  private selectAsset(tagName: string, values: unknown[]): GitHubReleaseAsset {
    const extension = this.platform === 'win32' ? '.msi' : '.dmg';
    const candidates = values
      .map((value) => this.parseAsset(value))
      .filter((asset): asset is GitHubReleaseAsset =>
        asset !== null && asset.name.toLowerCase().endsWith(extension));
    const architectureTokens = this.architecture === 'x64'
      ? ['x64', 'amd64']
      : [this.architecture];
    const architecturePattern = new RegExp(
      `(?:^|[-_.])(?:${architectureTokens.join('|')})(?:[-_.]|$)`,
      'i',
    );
    const architectureMatches = candidates.filter((asset) =>
      architecturePattern.test(asset.name));
    const hasExplicitArchitecture = candidates.some((asset) =>
      /(?:^|[-_.])(x64|amd64|arm64)(?:[-_.]|$)/i.test(asset.name));
    const selected = architectureMatches.length === 1
      ? architectureMatches[0]
      : candidates.length === 1 && !hasExplicitArchitecture
        ? candidates[0]
        : undefined;
    if (!selected) {
      throw new Error(`GitHub Release must contain one ${extension} installer for this device.`);
    }
    return selected;
  }

  /** Validate one GitHub asset record and its repository-bound API URL. */
  private parseAsset(value: unknown): GitHubReleaseAsset | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const asset = value as Record<string, unknown>;
    if (
      typeof asset.name !== 'string' ||
      asset.name.length === 0 ||
      path.basename(asset.name) !== asset.name ||
      typeof asset.id !== 'number' ||
      !Number.isSafeInteger(asset.id) ||
      asset.id <= 0 ||
      typeof asset.url !== 'string' ||
      asset.state !== 'uploaded' ||
      typeof asset.size !== 'number' ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0 ||
      typeof asset.digest !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(asset.digest)
    ) {
      return null;
    }
    let url: URL;
    try {
      url = new URL(asset.url);
    } catch {
      return null;
    }
    let segments: string[];
    try {
      segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    } catch {
      return null;
    }
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'api.github.com' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      segments.length !== 6 ||
      segments[0] !== 'repos' ||
      segments[1] !== 'zhxmt-xm' ||
      segments[2] !== 'Interceptor' ||
      segments[3] !== 'releases' ||
      segments[4] !== 'assets' ||
      segments[5] !== String(asset.id)
    ) {
      return null;
    }
    return {
      id: asset.id,
      name: asset.name,
      url: url.toString(),
      size: asset.size,
      sha256: asset.digest.slice(7),
    };
  }

  /** Convert untrusted Markdown/HTML release notes to complete display text. */
  private plainText(value: string): string | null {
    const text = value
      .replace(/\r\n?/g, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]+/g, ' ')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trim();
    return text || null;
  }

  /** Merge one status transition and notify all observers. */
  private transition(patch: Partial<UpdateStatus>): void {
    this.statusValue = { ...this.statusValue, ...patch };
    const snapshot = this.status();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

}
