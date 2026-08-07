import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SecureStore } from '../../interfaces';
import { GitHubAuthService } from '../github-auth-service';

/** Reversible test encryption that keeps token plaintext out of the file. */
class FakeSecureStore implements SecureStore {
  available = true;

  isEncryptionAvailable(): boolean {
    return this.available;
  }

  encryptString(plaintext: string): Buffer {
    return Buffer.from(Buffer.from(plaintext, 'utf8').toString('base64'), 'utf8');
  }

  decryptString(data: Buffer): string {
    return Buffer.from(data.toString('utf8'), 'base64').toString('utf8');
  }
}

describe('GitHubAuthService', () => {
  /** Temporary authorization roots removed after every test. */
  const roots: string[] = [];

  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
    roots.length = 0;
  });

  it('authorizes with Device Flow, validates identity and encrypts credentials', async () => {
    const fixture = await GitHubAuthFixture.create(roots);
    const statuses: string[] = [];
    fixture.gitHubAuthService.onStatusChange((status) => statuses.push(status.state));

    expect(await fixture.gitHubAuthService.signIn()).toMatchObject({
      state: 'authorizing',
      userCode: 'F7D2-9A4C',
      verificationUri: 'https://github.com/login/device',
    });
    await vi.waitFor(() => {
      expect(fixture.gitHubAuthService.status()).toMatchObject({
        state: 'signed-in',
        login: 'zhxmt-xm',
        userCode: null,
      });
    });

    expect(fixture.openExternal).toHaveBeenCalledWith('https://github.com/login/device');
    expect(statuses).toEqual(['authorizing', 'signed-in']);
    expect(await fixture.gitHubAuthService.getAccessToken()).toBe('ghu_access_one');
    const encrypted = await readFile(path.join(fixture.root, 'github-auth.enc'));
    expect(encrypted.toString('utf8')).not.toContain('ghu_access_one');
    expect(encrypted.toString('utf8')).not.toContain('ghr_refresh_one');
  });

  it('refreshes stored authorization on application start without a client secret', async () => {
    const fixture = await GitHubAuthFixture.create(roots);
    await fixture.authorize();
    fixture.requests.length = 0;

    const restored = fixture.createService();
    await restored.start();

    expect(restored.status()).toMatchObject({ state: 'signed-in', login: 'zhxmt-xm' });
    expect(await restored.getAccessToken()).toBe('ghu_access_two');
    const refreshRequest = fixture.requests.find((request) =>
      request.body.includes('grant_type=refresh_token'));
    expect(refreshRequest?.body).toContain('refresh_token=ghr_refresh_one');
    expect(refreshRequest?.body).not.toContain('client_secret');
  });

  it('clears login when the stored refresh token has expired', async () => {
    const fixture = await GitHubAuthFixture.create(roots);
    await fixture.authorize();
    fixture.advanceBy(15_897_600 * 1000 + 1);
    fixture.requests.length = 0;

    const restored = fixture.createService();
    await restored.start();

    expect(restored.status()).toMatchObject({
      state: 'signed-out',
      message: expect.stringContaining('could not be refreshed'),
    });
    expect(fixture.requests.some((request) =>
      request.body.includes('grant_type=refresh_token'))).toBe(false);
    await expect(access(path.join(fixture.root, 'github-auth.enc')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refreshes five minutes before the access token expires while running', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fixture = await GitHubAuthFixture.create(roots);
    await fixture.authorize();
    fixture.requests.length = 0;
    const refreshDelay = 8 * 60 * 60 * 1000 - 5 * 60 * 1000;
    fixture.advanceBy(refreshDelay);

    await vi.advanceTimersByTimeAsync(refreshDelay);

    expect(await fixture.gitHubAuthService.getAccessToken()).toBe('ghu_access_two');
    expect(fixture.requests.filter((request) =>
      request.body.includes('grant_type=refresh_token'))).toHaveLength(1);
    expect(fixture.gitHubAuthService.status().state).toBe('signed-in');
  });

  it('does not refresh after the application stops', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fixture = await GitHubAuthFixture.create(roots);
    await fixture.authorize();
    fixture.requests.length = 0;
    fixture.gitHubAuthService.stop();

    await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000);

    expect(fixture.requests).toEqual([]);
  });

  it('clears authorization when GitHub rejects a refresh token', async () => {
    const fixture = await GitHubAuthFixture.create(roots);
    await fixture.authorize();
    fixture.rejectRefresh();

    const restored = fixture.createService();
    await restored.start();

    expect(restored.status()).toMatchObject({
      state: 'signed-out',
      message: expect.stringContaining('could not be refreshed'),
    });
    await expect(access(path.join(fixture.root, 'github-auth.enc')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('signs out by deleting local credentials and cancelling authorization', async () => {
    const fixture = await GitHubAuthFixture.create(roots);
    await fixture.authorize();

    expect(await fixture.gitHubAuthService.signOut()).toMatchObject({ state: 'signed-out' });
    await expect(access(path.join(fixture.root, 'github-auth.enc')))
      .rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fixture.gitHubAuthService.getAccessToken()).toBeNull();
  });

  it('refuses to retain credentials when OS secure storage is unavailable', async () => {
    const fixture = await GitHubAuthFixture.create(roots);
    fixture.secureStore.available = false;

    await fixture.gitHubAuthService.signIn();
    await vi.waitFor(() => {
      expect(fixture.gitHubAuthService.status()).toMatchObject({
        state: 'failed',
        message: expect.stringContaining('secure storage'),
      });
    });
    await expect(access(path.join(fixture.root, 'github-auth.enc')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes malformed encrypted credentials and requires sign-in again', async () => {
    const fixture = await GitHubAuthFixture.create(roots);
    const credentialPath = path.join(fixture.root, 'github-auth.enc');
    await writeFile(
      credentialPath,
      fixture.secureStore.encryptString(JSON.stringify({
        accessToken: 'ghu_stale',
        accessTokenExpiresAt: 'not-a-date',
        refreshToken: 'ghr_stale',
        refreshTokenExpiresAt: 'also-not-a-date',
        login: 'zhxmt-xm',
      })),
    );

    const restored = fixture.createService();
    await restored.start();

    expect(restored.status()).toMatchObject({ state: 'signed-out' });
    await expect(access(credentialPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('clears encrypted credentials when OS secure storage is unavailable', async () => {
    const fixture = await GitHubAuthFixture.create(roots);
    await fixture.authorize();
    const credentialPath = path.join(fixture.root, 'github-auth.enc');
    fixture.secureStore.available = false;

    const unavailable = fixture.createService();
    await unavailable.start();

    expect(unavailable.status()).toMatchObject({ state: 'signed-out' });
    await expect(access(credentialPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

interface CapturedRequest {
  readonly url: string;
  readonly body: string;
}

/** Deterministic GitHub Device Flow and encrypted persistence fixture. */
class GitHubAuthFixture {
  readonly secureStore = new FakeSecureStore();
  readonly openExternal = vi.fn(async () => undefined);
  readonly requests: CapturedRequest[] = [];
  readonly fetcher: ReturnType<typeof vi.fn>;
  readonly gitHubAuthService: GitHubAuthService;
  private nowValue = new Date('2026-08-07T00:00:00.000Z');
  private tokenExchangeCount = 0;
  private refreshRejected = false;

  private constructor(readonly root: string) {
    this.fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body?.toString() ?? '';
      this.requests.push({ url, body });
      if (url.endsWith('/login/device/code')) {
        return Response.json({
          device_code: 'device-code',
          user_code: 'F7D2-9A4C',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5,
        });
      }
      if (url.endsWith('/login/oauth/access_token')) {
        this.tokenExchangeCount += 1;
        if (body.includes('device_code=') && this.tokenExchangeCount === 1) {
          return Response.json({ error: 'authorization_pending' });
        }
        const refreshed = body.includes('grant_type=refresh_token');
        if (refreshed && this.refreshRejected) {
          return new Response('unauthorized', { status: 401 });
        }
        return Response.json({
          access_token: refreshed ? 'ghu_access_two' : 'ghu_access_one',
          expires_in: 28_800,
          refresh_token: refreshed ? 'ghr_refresh_two' : 'ghr_refresh_one',
          refresh_token_expires_in: 15_897_600,
          token_type: 'bearer',
          scope: '',
        });
      }
      if (url === 'https://api.github.com/user') {
        return Response.json({ login: 'zhxmt-xm' });
      }
      return new Response('not found', { status: 404 });
    });
    this.gitHubAuthService = this.createService();
  }

  static async create(roots: string[]): Promise<GitHubAuthFixture> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'interceptor-github-auth-'));
    roots.push(root);
    return new GitHubAuthFixture(root);
  }

  createService(): GitHubAuthService {
    return new GitHubAuthService({
      clientId: GitHubAuthService.clientId,
      dataDirectory: this.root,
      secureStore: this.secureStore,
      openExternal: this.openExternal,
      fetcher: this.fetcher as unknown as typeof fetch,
      now: () => new Date(this.nowValue),
      wait: async (_milliseconds, signal) => {
        if (signal.aborted) {
          throw signal.reason;
        }
      },
    });
  }

  async authorize(): Promise<void> {
    await this.gitHubAuthService.signIn();
    await vi.waitFor(() => {
      expect(this.gitHubAuthService.status().state).toBe('signed-in');
    });
  }

  advanceBy(milliseconds: number): void {
    this.nowValue = new Date(this.nowValue.getTime() + milliseconds);
  }

  rejectRefresh(): void {
    this.refreshRejected = true;
  }
}