import type { UpstreamProxyConfig } from '@interceptor/core-protocol';

import type {
  SystemProxyCommandResult,
  SystemProxyCommandRunner,
  SystemProxyRestoreResult,
  SystemProxyService,
  SystemProxyStatus,
  WinInetProxySettings,
  WindowsSystemProxyJournalRecord,
  WindowsSystemProxyJournalStore,
  WindowsSystemProxyServiceOptions,
} from '../../interfaces';
import { systemProxyCommandRunner } from '../../utils';
import { SystemProxyError } from '../system-proxy-error';
import { toUpstreamProxyConfig } from './system-proxy-upstream';

type JournalResolution = 'owned' | 'not-owned' | 'externally-modified';

/** Manages one App's current-user WinINet takeover and crash recovery. */
export class WindowsSystemProxyService implements SystemProxyService {
  /** WinINet flag for direct access. */
  private static readonly PROXY_TYPE_DIRECT = 1;
  /** WinINet flag for an explicit proxy. */
  private static readonly PROXY_TYPE_PROXY = 2;
  /** WinINet flag for a PAC URL. */
  private static readonly PROXY_TYPE_AUTO_PROXY_URL = 4;
  /** WinINet flag for automatic proxy discovery. */
  private static readonly PROXY_TYPE_AUTO_DETECT = 8;
  /** Complete settings captured before this App wrote its loopback proxy. */
  private originalSettings: WinInetProxySettings | null = null;
  /** Exact settings written by this App. */
  private ownedSettings: WinInetProxySettings | null = null;
  /** Whether another program replaced the settings written by this App. */
  private ownershipLost = false;
  /** Upstream derived from the original settings while 8888 is active. */
  private upstream: UpstreamProxyConfig | null = null;
  /** Runtime platform used to report unsupported hosts. */
  private readonly platform: NodeJS.Platform;
  /** Native WinINet helper executable. */
  private readonly helperPath: string;
  /** Injectable helper process boundary. */
  private readonly runner: SystemProxyCommandRunner;
  /** Optional user-level crash journal. */
  private readonly journal: WindowsSystemProxyJournalStore | null;

  /** Configure platform, native helper and optional crash persistence. */
  constructor(options: WindowsSystemProxyServiceOptions) {
    this.platform = options.platform ?? process.platform;
    this.helperPath = options.helperPath;
    this.runner = options.runner ?? systemProxyCommandRunner;
    this.journal = options.journal ?? null;
  }

  /** Whether this service can manage the current-user WinINet proxy. */
  supported(): boolean {
    return this.platform === 'win32';
  }

  /** Read current settings and report exact process-local ownership. */
  async status(): Promise<SystemProxyStatus> {
    if (!this.supported()) {
      return WindowsSystemProxyService.unsupportedStatus();
    }
    const current = await this.readSettings();
    const owned = this.ownedSettings !== null
      && WindowsSystemProxyService.equalSettings(current, this.ownedSettings);
    if (this.ownedSettings !== null && !owned) {
      this.ownershipLost = true;
    }
    return WindowsSystemProxyService.toStatus(current, owned, this.ownershipLost);
  }

  /** Load one crashed App's snapshots without rewriting unchanged owned WinINet. */
  async recoverAfterCrash(): Promise<SystemProxyRestoreResult> {
    if (!this.supported()) {
      return {
        restored: false,
        reason: 'not-owned',
        status: WindowsSystemProxyService.unsupportedStatus(),
      };
    }
    const current = await this.readSettings();
    const record = await this.journal?.read();
    if (!record) {
      return {
        restored: false,
        reason: 'not-owned',
        status: WindowsSystemProxyService.toStatus(current, false, false),
      };
    }
    return this.toRecoveryResult(await this.resolveJournal(record, current), current);
  }

  /** Save current settings, write the loopback proxy and verify exact readback. */
  async enable(host: string, port: number): Promise<SystemProxyStatus> {
    this.assertSupported();
    const authority = WindowsSystemProxyService.loopbackAuthority(host, port);
    const current = await this.readSettings();
    if (this.ownedSettings !== null) {
      if (!WindowsSystemProxyService.equalSettings(current, this.ownedSettings)) {
        this.ownershipLost = true;
        throw WindowsSystemProxyService.externallyModifiedError();
      }
      return WindowsSystemProxyService.toStatus(current, true, false);
    }

    const existingRecord = await this.journal?.read();
    if (existingRecord) {
      const resolution = await this.resolveJournal(existingRecord, current);
      if (resolution === 'owned') {
        return WindowsSystemProxyService.toStatus(current, true, false);
      }
    }

    const target = WindowsSystemProxyService.ownedProxySettings(current, authority);
    await this.journal?.save(current, target);
    this.rememberOwnership(current, target, authority);
    await this.writeSettings(target);
    const written = await this.readSettings();
    if (!WindowsSystemProxyService.equalSettings(written, target)) {
      this.forgetOwnership();
      throw new SystemProxyError('WinINet proxy settings did not match after write.');
    }
    this.ownedSettings = written;
    return WindowsSystemProxyService.toStatus(written, true, false);
  }

  /** Restore original settings only while current still exactly equals owned. */
  async restore(): Promise<SystemProxyRestoreResult> {
    if (!this.supported()) {
      return {
        restored: false,
        reason: 'not-owned',
        status: WindowsSystemProxyService.unsupportedStatus(),
      };
    }
    const current = await this.readSettings();
    const record = await this.journal?.read();
    if (record) {
      const resolution = await this.resolveJournal(record, current);
      if (resolution !== 'owned') {
        return this.toRecoveryResult(resolution, current);
      }
      return this.restoreOwned(record.original, record.owned, current);
    }
    if (!this.originalSettings || !this.ownedSettings) {
      return {
        restored: false,
        reason: 'not-owned',
        status: WindowsSystemProxyService.toStatus(current, false, this.ownershipLost),
      };
    }
    return this.restoreOwned(this.originalSettings, this.ownedSettings, current);
  }

  /** Return the upstream derived from the original proxy snapshot. */
  detectedUpstream(): UpstreamProxyConfig | null {
    return this.upstream;
  }

  /** Resolve one current/original/owned tuple for the single supported App. */
  private async resolveJournal(
    record: WindowsSystemProxyJournalRecord,
    current: WinInetProxySettings,
  ): Promise<JournalResolution> {
    if (WindowsSystemProxyService.equalSettings(current, record.owned)) {
      this.rememberOwnership(
        record.original,
        record.owned,
        WindowsSystemProxyService.readOwnedAuthority(record.owned),
      );
      return 'owned';
    }
    if (WindowsSystemProxyService.equalSettings(current, record.original)) {
      await this.journal?.clear();
      this.forgetOwnership();
      return 'not-owned';
    }
    await this.journal?.clear();
    this.forgetOwnership();
    this.ownershipLost = true;
    return 'externally-modified';
  }

  /** Map one journal resolution to the public recovery result. */
  private toRecoveryResult(
    resolution: JournalResolution,
    current: WinInetProxySettings,
  ): SystemProxyRestoreResult {
    if (resolution === 'owned') {
      return {
        restored: false,
        status: WindowsSystemProxyService.toStatus(current, true, false),
      };
    }
    return {
      restored: false,
      reason: resolution,
      status: WindowsSystemProxyService.toStatus(
        current,
        false,
        resolution === 'externally-modified',
      ),
    };
  }

  /** Retain snapshots and the upstream after a new or recovered takeover. */
  private rememberOwnership(
    original: WinInetProxySettings,
    owned: WinInetProxySettings,
    authority: string,
  ): void {
    this.originalSettings = original;
    this.ownedSettings = owned;
    this.upstream = toUpstreamProxyConfig(original, authority);
    this.ownershipLost = false;
  }

  /** Clear all process-local takeover state. */
  private forgetOwnership(): void {
    this.originalSettings = null;
    this.ownedSettings = null;
    this.upstream = null;
    this.ownershipLost = false;
  }

  /** Restore one known original after an exact current-versus-owned comparison. */
  private async restoreOwned(
    original: WinInetProxySettings,
    owned: WinInetProxySettings,
    current: WinInetProxySettings,
  ): Promise<SystemProxyRestoreResult> {
    if (!WindowsSystemProxyService.equalSettings(current, owned)) {
      await this.journal?.clear();
      this.forgetOwnership();
      this.ownershipLost = true;
      return {
        restored: false,
        reason: 'externally-modified',
        status: WindowsSystemProxyService.toStatus(current, false, true),
      };
    }
    await this.writeSettings(original);
    const restored = await this.readSettings();
    if (!WindowsSystemProxyService.equalSettings(restored, original)) {
      throw new SystemProxyError('WinINet proxy settings did not match after restore.');
    }
    await this.journal?.clear();
    this.forgetOwnership();
    return {
      restored: true,
      status: WindowsSystemProxyService.toStatus(restored, false, false),
    };
  }

  /** Read and validate one complete WinINet snapshot. */
  private async readSettings(): Promise<WinInetProxySettings> {
    const result = await this.run(['get']);
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw new SystemProxyError('WinINet helper returned invalid JSON.');
    }
    return WindowsSystemProxyService.parseSettings(parsed);
  }

  /** Write one complete WinINet snapshot. */
  private async writeSettings(settings: WinInetProxySettings): Promise<void> {
    await this.run([
      'set',
      String(settings.flags),
      WindowsSystemProxyService.encodeNullable(settings.proxyServer),
      WindowsSystemProxyService.encodeNullable(settings.bypassList),
      WindowsSystemProxyService.encodeNullable(settings.pacUrl),
    ]);
  }

  /** Execute one bounded native helper command. */
  private async run(args: readonly string[]): Promise<SystemProxyCommandResult> {
    const result = await this.runner.run(this.helperPath, args);
    if (result.code !== 0) {
      const detail = result.stderr || result.stdout || 'unknown error';
      throw new SystemProxyError(`WinINet helper failed (exit ${result.code}): ${detail}`);
    }
    return result;
  }

  /** Reject mutating calls on unsupported platforms. */
  private assertSupported(): void {
    if (!this.supported()) {
      throw new SystemProxyError(`Windows system proxy is not supported on ${this.platform}.`);
    }
  }

  /** Build loopback-owned settings from the current snapshot. */
  private static ownedProxySettings(
    current: WinInetProxySettings,
    authority: string,
  ): WinInetProxySettings {
    const flags = (
      current.flags
      & ~(
        WindowsSystemProxyService.PROXY_TYPE_PROXY
        | WindowsSystemProxyService.PROXY_TYPE_AUTO_PROXY_URL
        | WindowsSystemProxyService.PROXY_TYPE_AUTO_DETECT
      )
    ) | WindowsSystemProxyService.PROXY_TYPE_DIRECT
      | WindowsSystemProxyService.PROXY_TYPE_PROXY;
    return {
      flags,
      proxyEnabled: true,
      autoDetect: false,
      proxyServer: `http=${authority};https=${authority}`,
      bypassList: WindowsSystemProxyService.withRequiredBypass(current.bypassList),
      pacUrl: null,
    };
  }

  /** Preserve user bypass entries and add required loopback exclusions. */
  private static withRequiredBypass(value: string | null): string {
    const entries = (value ?? '')
      .split(';')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return [...new Set([...entries, 'localhost', '127.*', '[::1]', '<local>'])].join(';');
  }

  /** Validate and format one loopback listener authority. */
  private static loopbackAuthority(host: string, port: number): string {
    if (host !== '127.0.0.1' && host !== '::1') {
      throw new SystemProxyError('System proxy requires a loopback listener.');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new SystemProxyError('System proxy port is invalid.');
    }
    return host === '::1' ? `[::1]:${port}` : `${host}:${port}`;
  }

  /** Read the loopback authority from a validated owned snapshot. */
  private static readOwnedAuthority(settings: WinInetProxySettings): string {
    const match = settings.proxyServer?.match(
      /^http=(127\.0\.0\.1:\d+|\[::1\]:\d+);https=\1$/,
    );
    if (!match?.[1]) {
      throw new SystemProxyError('System proxy journal contains an invalid owned authority.');
    }
    const port = Number(match[1].slice(match[1].lastIndexOf(':') + 1));
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new SystemProxyError('System proxy journal contains an invalid owned authority.');
    }
    return match[1];
  }

  /** Validate one bounded WinINet helper result. */
  private static parseSettings(value: unknown): WinInetProxySettings {
    if (typeof value !== 'object' || value === null) {
      throw new SystemProxyError('WinINet helper result must be an object.');
    }
    const record = value as Record<string, unknown>;
    if (
      !Number.isInteger(record.flags)
      || (record.flags as number) < 0
      || typeof record.proxyEnabled !== 'boolean'
      || typeof record.autoDetect !== 'boolean'
    ) {
      throw new SystemProxyError('WinINet helper result has invalid flags.');
    }
    return {
      flags: record.flags as number,
      proxyEnabled: record.proxyEnabled,
      autoDetect: record.autoDetect,
      proxyServer: WindowsSystemProxyService.nullableString(record.proxyServer, 'proxyServer'),
      bypassList: WindowsSystemProxyService.nullableString(record.bypassList, 'bypassList'),
      pacUrl: WindowsSystemProxyService.nullableString(record.pacUrl, 'pacUrl'),
    };
  }

  /** Validate one nullable helper string. */
  private static nullableString(value: unknown, name: string): string | null {
    if (value === null) {
      return null;
    }
    if (typeof value !== 'string') {
      throw new SystemProxyError(`WinINet helper result ${name} is invalid.`);
    }
    return value;
  }

  /** Encode one nullable helper string. */
  private static encodeNullable(value: string | null): string {
    return value === null ? '-' : Buffer.from(value, 'utf8').toString('base64');
  }

  /** Compare every WinINet field used for restoration. */
  private static equalSettings(
    left: WinInetProxySettings,
    right: WinInetProxySettings,
  ): boolean {
    return left.flags === right.flags
      && left.proxyEnabled === right.proxyEnabled
      && left.autoDetect === right.autoDetect
      && left.proxyServer === right.proxyServer
      && left.bypassList === right.bypassList
      && left.pacUrl === right.pacUrl;
  }

  /** Build the shared ownership-loss error. */
  private static externallyModifiedError(): SystemProxyError {
    return new SystemProxyError(
      'System proxy ownership was lost because settings were modified externally.',
    );
  }

  /** Map WinINet settings to the public status. */
  private static toStatus(
    settings: WinInetProxySettings,
    owned: boolean,
    ownershipLost: boolean,
  ): SystemProxyStatus {
    return {
      supported: true,
      enabled: settings.proxyEnabled,
      owned,
      ownershipLost,
      proxyServer: settings.proxyServer,
      bypassList: settings.bypassList,
      pacUrl: settings.pacUrl,
      autoDetect: settings.autoDetect,
    };
  }

  /** Return the fixed unsupported-platform status. */
  private static unsupportedStatus(): SystemProxyStatus {
    return {
      supported: false,
      enabled: false,
      owned: false,
      ownershipLost: false,
      proxyServer: null,
      bypassList: null,
      pacUrl: null,
      autoDetect: false,
    };
  }
}