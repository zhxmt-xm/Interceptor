import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import type { GitHubAuthStatus } from '../../shared/desktop-api';
import type {
  GitHubAuthCredentials,
  GitHubAuthServiceOptions,
} from '../interfaces';

interface GitHubDeviceChallenge {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly expiresAt: string;
  readonly intervalMilliseconds: number;
}

interface GitHubTokenResult {
  readonly credentials: Omit<GitHubAuthCredentials, 'login'> | null;
  readonly error: string | null;
}

/** Owns GitHub App Device Flow and keeps user credentials inside Main. */
export class GitHubAuthService {
  /** Public GitHub App client identifier; no client secret is embedded. */
  static readonly clientId = 'Iv23li2gT0l9C4mWEOO7';
  /** Fixed Device Flow endpoint. */
  private static readonly deviceCodeUrl = 'https://github.com/login/device/code';
  /** Fixed OAuth token and refresh endpoint. */
  private static readonly tokenUrl = 'https://github.com/login/oauth/access_token';
  /** Fixed identity endpoint used after every authorization and refresh. */
  private static readonly userApi = 'https://api.github.com/user';
  /** Only browser destination accepted from the Device Flow response. */
  private static readonly verificationUri = 'https://github.com/login/device';
  /** Maximum encrypted credential file size accepted from disk. */
  private static readonly maxCredentialBytes = 64 * 1024;
  /** Refresh the access token shortly before GitHub expires it. */
  private static readonly refreshLeadMilliseconds = 5 * 60_000;

  /** Encrypted credential path under Electron userData. */
  private readonly credentialPath: string;
  /** GitHub App client identifier. */
  private readonly clientIdValue: string;
  /** OS-backed encryption boundary. */
  private readonly secureStore: GitHubAuthServiceOptions['secureStore'];
  /** Opens the fixed GitHub Device Flow page in the default browser. */
  private readonly openExternal: GitHubAuthServiceOptions['openExternal'];
  /** Injectable network boundary. */
  private readonly fetcher: typeof fetch;
  /** Injectable time source. */
  private readonly now: () => Date;
  /** Injectable abortable polling delay. */
  private readonly wait: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  /** Public immutable state snapshot. */
  private statusValue: GitHubAuthStatus = GitHubAuthService.signedOutStatus();
  /** Main subscribers for Renderer broadcast and update coordination. */
  private readonly listeners = new Set<(status: GitHubAuthStatus) => void>();
  /** Decrypted credentials retained only in Main memory. */
  private credentials: GitHubAuthCredentials | null = null;
  /** Deduplicates the initial Device Flow request. */
  private signInOperation: Promise<GitHubAuthStatus> | null = null;
  /** Tracks the background Device Flow poller. */
  private deviceFlowOperation: Promise<void> | null = null;
  /** Cancels active Device Flow requests on sign-out or shutdown. */
  private deviceFlowAbortController: AbortController | null = null;
  /** One scheduled refresh based on the latest access-token expiration. */
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  /** Deduplicates a scheduled refresh and an update request after system sleep. */
  private refreshOperation: Promise<boolean> | null = null;
  /** Cancels the current refresh when signing out or quitting. */
  private refreshAbortController: AbortController | null = null;

  /** Bind authorization to one app registration and one encrypted local file. */
  constructor(options: GitHubAuthServiceOptions) {
    this.clientIdValue = options.clientId;
    this.credentialPath = path.join(options.dataDirectory, 'github-auth.enc');
    this.secureStore = options.secureStore;
    this.openExternal = options.openExternal;
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.wait = options.wait ?? GitHubAuthService.waitFor;
  }

  /** Restore encrypted authorization without exposing or validating it in Renderer. */
  async start(): Promise<void> {
    try {
      const credentials = await this.readCredentials();
      if (!credentials) {
        return;
      }
      if (
        !credentials.refreshToken ||
        !credentials.refreshTokenExpiresAt ||
        Date.parse(credentials.refreshTokenExpiresAt) <= this.now().getTime()
      ) {
        await this.clearAuthorization();
        return;
      }
      this.credentials = credentials;
      if (await this.refreshAuthorization()) {
        this.transition(GitHubAuthService.signedInStatus(this.credentials!.login));
      }
    } catch {
      await this.clearAuthorization();
    }
  }

  /** Return a detached public snapshot without credentials. */
  status(): GitHubAuthStatus {
    return { ...this.statusValue };
  }

  /** Subscribe to public authorization changes. */
  onStatusChange(listener: (status: GitHubAuthStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Request a one-time code, open GitHub and poll authorization in Main. */
  signIn(): Promise<GitHubAuthStatus> {
    if (this.deviceFlowOperation) {
      return Promise.resolve(this.status());
    }
    if (this.signInOperation) {
      return this.signInOperation;
    }
    this.signInOperation = this.beginDeviceFlow().finally(() => {
      this.signInOperation = null;
    });
    return this.signInOperation;
  }

  /** Reopen the fixed GitHub authorization page for the active code. */
  async openAuthorizationPage(): Promise<void> {
    if (
      this.statusValue.state !== 'authorizing' ||
      this.statusValue.verificationUri !== GitHubAuthService.verificationUri
    ) {
      throw new Error('No GitHub device authorization is active.');
    }
    await this.openExternal(GitHubAuthService.verificationUri);
  }

  /** Return the access token created at sign-in or the latest application start. */
  async getAccessToken(): Promise<string | null> {
    if (this.refreshOperation) {
      await this.refreshOperation;
    }
    if (!this.credentials) {
      return null;
    }
    if (this.accessTokenExpired(this.credentials)) {
      await this.refreshAuthorization();
    }
    return this.credentials?.accessToken ?? null;
  }

  /** Revoke local use immediately and remove encrypted credentials. */
  async signOut(): Promise<GitHubAuthStatus> {
    this.clearRefreshTimer();
    this.deviceFlowAbortController?.abort();
    this.refreshAbortController?.abort();
    await Promise.allSettled([
      this.deviceFlowOperation ?? Promise.resolve(),
      this.refreshOperation ?? Promise.resolve(),
    ]);
    this.credentials = null;
    await rm(this.credentialPath, { force: true });
    this.transition(GitHubAuthService.signedOutStatus());
    return this.status();
  }

  /** Stop in-flight polling and detach subscribers without deleting authorization. */
  stop(): void {
    this.clearRefreshTimer();
    this.deviceFlowAbortController?.abort();
    this.refreshAbortController?.abort();
    this.listeners.clear();
  }

  /** Obtain the challenge before starting a background token poller. */
  private async beginDeviceFlow(): Promise<GitHubAuthStatus> {
    this.deviceFlowAbortController?.abort();
    const abortController = new AbortController();
    this.deviceFlowAbortController = abortController;
    try {
      const challenge = await this.requestDeviceChallenge(abortController.signal);
      this.transition({
        state: 'authorizing',
        login: null,
        userCode: challenge.userCode,
        verificationUri: challenge.verificationUri,
        expiresAt: challenge.expiresAt,
        message: 'Enter the one-time code in GitHub to authorize this device.',
      });
      await this.openExternal(challenge.verificationUri).catch(() => undefined);
      this.deviceFlowOperation = this.pollDeviceFlow(challenge, abortController.signal)
        .catch((error: unknown) => {
          if (!GitHubAuthService.isAbortError(error)) {
            this.transition(GitHubAuthService.failedStatus(
              error instanceof Error ? error.message : String(error),
            ));
          }
        })
        .finally(() => {
          if (this.deviceFlowAbortController === abortController) {
            this.deviceFlowAbortController = null;
          }
          this.deviceFlowOperation = null;
        });
      void this.deviceFlowOperation;
      return this.status();
    } catch (error) {
      if (!GitHubAuthService.isAbortError(error)) {
        this.transition(GitHubAuthService.failedStatus(
          error instanceof Error ? error.message : String(error),
        ));
      }
      return this.status();
    }
  }

  /** Poll at GitHub's requested interval until authorized, denied or expired. */
  private async pollDeviceFlow(
    challenge: GitHubDeviceChallenge,
    signal: AbortSignal,
  ): Promise<void> {
    let intervalMilliseconds = challenge.intervalMilliseconds;
    while (this.now().getTime() < Date.parse(challenge.expiresAt)) {
      await this.wait(intervalMilliseconds, signal);
      const result = await this.requestToken({
        client_id: this.clientIdValue,
        device_code: challenge.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }, signal);
      if (result.credentials) {
        const login = await this.readLogin(result.credentials.accessToken, signal);
        const credentials = { ...result.credentials, login };
        if (signal.aborted) {
          throw signal.reason;
        }
        await this.writeCredentials(credentials);
        if (signal.aborted) {
          return;
        }
        this.credentials = credentials;
        this.transition(GitHubAuthService.signedInStatus(login));
        this.scheduleRefresh(credentials);
        return;
      }
      if (result.error === 'authorization_pending') {
        continue;
      }
      if (result.error === 'slow_down') {
        intervalMilliseconds += 5_000;
        continue;
      }
      if (result.error === 'access_denied') {
        throw new Error('GitHub authorization was declined.');
      }
      if (result.error === 'expired_token') {
        throw new Error('The GitHub authorization code expired. Try again.');
      }
      throw new Error('GitHub could not authorize this device.');
    }
    throw new Error('The GitHub authorization code expired. Try again.');
  }

  /** Request one bounded Device Flow challenge from GitHub. */
  private async requestDeviceChallenge(signal: AbortSignal): Promise<GitHubDeviceChallenge> {
    const response = await this.fetcher(GitHubAuthService.deviceCodeUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ client_id: this.clientIdValue }),
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    });
    if (!response.ok) {
      throw new Error(`GitHub device authorization returned HTTP ${response.status}.`);
    }
    const value = await GitHubAuthService.readJsonObject(response);
    if (
      typeof value.device_code !== 'string' ||
      typeof value.user_code !== 'string' ||
      value.verification_uri !== GitHubAuthService.verificationUri ||
      !Number.isSafeInteger(value.expires_in) ||
      (value.expires_in as number) <= 0 ||
      !Number.isSafeInteger(value.interval) ||
      (value.interval as number) <= 0
    ) {
      throw new Error('GitHub device authorization response is invalid.');
    }
    return {
      deviceCode: value.device_code,
      userCode: value.user_code,
      verificationUri: value.verification_uri,
      expiresAt: new Date(
        this.now().getTime() + (value.expires_in as number) * 1000,
      ).toISOString(),
      intervalMilliseconds: (value.interval as number) * 1000,
    };
  }

  /** Exchange a device or refresh grant for one user access token. */
  private async requestToken(
    parameters: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<GitHubTokenResult> {
    const response = await this.fetcher(GitHubAuthService.tokenUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(parameters),
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    });
    if (response.status === 401) {
      throw new Error('GitHub rejected the stored authorization.');
    }
    if (!response.ok) {
      throw new Error(`GitHub token exchange returned HTTP ${response.status}.`);
    }
    const value = await GitHubAuthService.readJsonObject(response);
    if (typeof value.error === 'string') {
      return { credentials: null, error: value.error };
    }
    if (
      typeof value.access_token !== 'string' ||
      value.access_token.length === 0 ||
      value.token_type !== 'bearer'
    ) {
      throw new Error('GitHub token response is invalid.');
    }
    const accessTokenExpiresAt = GitHubAuthService.expirationFrom(
      value.expires_in,
      this.now(),
    );
    const refreshToken = typeof value.refresh_token === 'string'
      ? value.refresh_token
      : null;
    const refreshTokenExpiresAt = refreshToken
      ? GitHubAuthService.expirationFrom(value.refresh_token_expires_in, this.now())
      : null;
    if ((accessTokenExpiresAt === null) !== (refreshToken === null)) {
      throw new Error('GitHub token expiration fields are invalid.');
    }
    return {
      credentials: {
        accessToken: value.access_token,
        accessTokenExpiresAt,
        refreshToken,
        refreshTokenExpiresAt,
      },
      error: null,
    };
  }

  /** Validate the authorized identity before accepting new credentials. */
  private async readLogin(accessToken: string, signal?: AbortSignal): Promise<string> {
    const response = await this.fetcher(GitHubAuthService.userApi, {
      method: 'GET',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${accessToken}`,
        'x-github-api-version': '2026-03-10',
      },
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    });
    if (response.status === 401) {
      throw new Error('GitHub rejected the stored authorization.');
    }
    if (!response.ok) {
      throw new Error(`GitHub identity validation returned HTTP ${response.status}.`);
    }
    const value = await GitHubAuthService.readJsonObject(response);
    if (typeof value.login !== 'string' || value.login.length === 0) {
      throw new Error('GitHub identity response is invalid.');
    }
    return value.login;
  }

  /** Exchange one valid stored refresh token for a rotated credential pair. */
  private async refreshCredentials(
    current: GitHubAuthCredentials,
    signal: AbortSignal,
  ): Promise<GitHubAuthCredentials> {
    if (!current.refreshToken) {
      throw new Error('Stored GitHub authorization has no refresh token.');
    }
    const result = await this.requestToken({
      client_id: this.clientIdValue,
      grant_type: 'refresh_token',
      refresh_token: current.refreshToken,
    }, signal);
    if (!result.credentials) {
      if (result.error === 'bad_refresh_token') {
        throw new Error('GitHub rejected the stored refresh token.');
      }
      throw new Error('GitHub authorization could not be refreshed.');
    }
    const login = await this.readLogin(result.credentials.accessToken, signal);
    if (login !== current.login) {
      throw new Error('GitHub refreshed authorization for an unexpected account.');
    }
    const credentials = { ...result.credentials, login };
    await this.writeCredentials(credentials);
    return credentials;
  }

  /** Refresh once, clear login on failure, and schedule from the rotated expiration. */
  private refreshAuthorization(): Promise<boolean> {
    if (this.refreshOperation) {
      return this.refreshOperation;
    }
    const credentials = this.credentials;
    if (
      !credentials?.refreshToken ||
      !credentials.refreshTokenExpiresAt ||
      Date.parse(credentials.refreshTokenExpiresAt) <= this.now().getTime()
    ) {
      return this.clearAuthorization().then(() => false);
    }
    const abortController = new AbortController();
    this.refreshAbortController = abortController;
    const operation = this.refreshCredentials(credentials, abortController.signal)
      .then((refreshed) => {
        if (abortController.signal.aborted) {
          return false;
        }
        this.credentials = refreshed;
        this.scheduleRefresh(refreshed);
        return true;
      })
      .catch(async () => {
        if (abortController.signal.aborted) {
          return false;
        }
        await this.clearAuthorization();
        return false;
      })
      .finally(() => {
        if (this.refreshAbortController === abortController) {
          this.refreshAbortController = null;
        }
        if (this.refreshOperation === operation) {
          this.refreshOperation = null;
        }
      });
    this.refreshOperation = operation;
    return operation;
  }

  /** Schedule exactly one refresh from the latest access-token expiration. */
  private scheduleRefresh(credentials: GitHubAuthCredentials): void {
    this.clearRefreshTimer();
    if (!credentials.accessTokenExpiresAt) {
      return;
    }
    const delay = Math.max(
      0,
      Date.parse(credentials.accessTokenExpiresAt) -
        this.now().getTime() -
        GitHubAuthService.refreshLeadMilliseconds,
    );
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshAuthorization();
    }, delay);
    this.refreshTimer.unref?.();
  }

  /** Cancel the single scheduled refresh. */
  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /** Remove authorization that cannot be refreshed or used. */
  private async clearAuthorization(): Promise<void> {
    this.clearRefreshTimer();
    this.credentials = null;
    await rm(this.credentialPath, { force: true });
    this.transition(GitHubAuthService.signedOutStatus(
      'GitHub authorization could not be refreshed. Sign in again.',
    ));
  }

  /** Check whether the current process can still use its startup access token. */
  private accessTokenExpired(credentials: GitHubAuthCredentials): boolean {
    return credentials.accessTokenExpiresAt !== null &&
      Date.parse(credentials.accessTokenExpiresAt) <= this.now().getTime();
  }

  /** Encrypt and atomically replace the complete credential record. */
  private async writeCredentials(credentials: GitHubAuthCredentials): Promise<void> {
    if (!this.secureStore.isEncryptionAvailable()) {
      throw new Error(
        'OS secure storage is unavailable; GitHub authorization was not saved.',
      );
    }
    const encrypted = this.secureStore.encryptString(JSON.stringify(credentials));
    const directory = path.dirname(this.credentialPath);
    const temporaryPath = path.join(
      directory,
      `.${path.basename(this.credentialPath)}.${randomUUID()}.tmp`,
    );
    await mkdir(directory, { recursive: true });
    const file = await open(temporaryPath, 'wx', 0o600);
    try {
      await file.writeFile(encrypted);
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      await rename(temporaryPath, this.credentialPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  /** Read and decrypt one bounded regular credential file. */
  private async readCredentials(): Promise<GitHubAuthCredentials | null> {
    let metadata;
    try {
      metadata = await lstat(this.credentialPath);
    } catch (error) {
      if (GitHubAuthService.isMissing(error)) {
        return null;
      }
      throw error;
    }
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size > GitHubAuthService.maxCredentialBytes
    ) {
      throw new Error('GitHub credential file is invalid.');
    }
    if (!this.secureStore.isEncryptionAvailable()) {
      throw new Error('OS secure storage is unavailable.');
    }
    let plaintext: string;
    try {
      plaintext = this.secureStore.decryptString(await readFile(this.credentialPath));
    } catch {
      throw new Error('Stored GitHub authorization could not be decrypted.');
    }
    let value: unknown;
    try {
      value = JSON.parse(plaintext);
    } catch {
      throw new Error('GitHub credential file contains invalid JSON.');
    }
    return GitHubAuthService.parseCredentials(value);
  }

  /** Validate the decrypted credential envelope. */
  private static parseCredentials(value: unknown): GitHubAuthCredentials {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('GitHub credentials are invalid.');
    }
    const credentials = value as Record<string, unknown>;
    if (
      typeof credentials.accessToken !== 'string' ||
      credentials.accessToken.length === 0 ||
      !(typeof credentials.accessTokenExpiresAt === 'string' ||
        credentials.accessTokenExpiresAt === null) ||
      !(typeof credentials.refreshToken === 'string' || credentials.refreshToken === null) ||
      !(typeof credentials.refreshTokenExpiresAt === 'string' ||
        credentials.refreshTokenExpiresAt === null) ||
      typeof credentials.login !== 'string' ||
      credentials.login.length === 0 ||
      !GitHubAuthService.validTimestamp(credentials.accessTokenExpiresAt) ||
      !GitHubAuthService.validTimestamp(credentials.refreshTokenExpiresAt) ||
      ((credentials.accessTokenExpiresAt === null) !==
        (credentials.refreshToken === null)) ||
      ((credentials.refreshToken === null) !==
        (credentials.refreshTokenExpiresAt === null))
    ) {
      throw new Error('GitHub credential fields are invalid.');
    }
    return credentials as unknown as GitHubAuthCredentials;
  }

  /** Merge one public state transition and notify Main subscribers. */
  private transition(status: GitHubAuthStatus): void {
    this.statusValue = status;
    const snapshot = this.status();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  /** Construct the default signed-out state. */
  private static signedOutStatus(message = 'Sign in with GitHub to access private releases.'):
    GitHubAuthStatus {
    return {
      state: 'signed-out',
      login: null,
      userCode: null,
      verificationUri: null,
      expiresAt: null,
      message,
    };
  }

  /** Construct a signed-in state containing only the public login. */
  private static signedInStatus(login: string): GitHubAuthStatus {
    return {
      state: 'signed-in',
      login,
      userCode: null,
      verificationUri: null,
      expiresAt: null,
      message: 'GitHub authorization is stored securely on this device.',
    };
  }

  /** Construct an authorization failure without preserving a device code. */
  private static failedStatus(message: string): GitHubAuthStatus {
    return {
      state: 'failed',
      login: null,
      userCode: null,
      verificationUri: null,
      expiresAt: null,
      message,
    };
  }

  /** Convert one GitHub lifetime in seconds to an absolute timestamp. */
  private static expirationFrom(value: unknown, now: Date): string | null {
    if (value === undefined) {
      return null;
    }
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
      throw new Error('GitHub token lifetime is invalid.');
    }
    return new Date(now.getTime() + (value as number) * 1000).toISOString();
  }

  /** Accept null or one parseable absolute timestamp from encrypted storage. */
  private static validTimestamp(value: unknown): boolean {
    return value === null ||
      (typeof value === 'string' && Number.isFinite(Date.parse(value)));
  }

  /** Parse a JSON response into one object. */
  private static async readJsonObject(response: Response): Promise<Record<string, unknown>> {
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new Error('GitHub returned invalid JSON.');
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('GitHub returned an invalid response.');
    }
    return value as Record<string, unknown>;
  }

  /** Wait for one polling interval while remaining abortable. */
  private static waitFor(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      const onAbort = (): void => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, milliseconds);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** Identify expected aborts from sign-out or application shutdown. */
  private static isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
  }

  /** Identify an expected missing credential file. */
  private static isMissing(error: unknown): boolean {
    return typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT';
  }
}