import { SystemProxyError } from './system-proxy-error';
import { toUpstreamProxyConfig } from './system-proxy-upstream';
import type { UpstreamProxyConfig } from '@interceptor/core-protocol';
import type {
  SystemProxyCommandResult,
  SystemProxyCommandRunner,
  SystemProxyJournalStore,
  SystemProxyRestoreResult,
  SystemProxyService,
  SystemProxyStatus,
  WinInetProxySettings,
  WindowsSystemProxyServiceOptions,
} from '../interfaces';
import { systemProxyCommandRunner } from '../utils';

/** Current-user WinINet proxy ownership, guarded restoration and helper I/O. */
export class WindowsSystemProxyService implements SystemProxyService {
  /** WinINet PROXY_TYPE 位标志：直连。 */
  private static readonly PROXY_TYPE_DIRECT = 1;
  /** WinINet PROXY_TYPE 位标志：显式代理。 */
  private static readonly PROXY_TYPE_PROXY = 2;
  /** WinINet PROXY_TYPE 位标志：PAC 脚本。 */
  private static readonly PROXY_TYPE_AUTO_PROXY_URL = 4;
  /** WinINet PROXY_TYPE 位标志：自动检测。 */
  private static readonly PROXY_TYPE_AUTO_DETECT = 8;
  /** Original settings captured immediately before this process enabled the proxy. */
  private originalSettings: WinInetProxySettings | null = null;
  /** Exact settings written by this process; restoration requires an exact current match. */
  private ownedSettings: WinInetProxySettings | null = null;
  /** Sticky indication that an external actor changed settings after ownership was acquired. */
  private ownershipLost = false;
  /** 接管前读到的用户原有上游代理；接管期间流量必须继续经它出网。 */
  private upstream: UpstreamProxyConfig | null = null;
  /** Runtime platform used to explicitly report unsupported hosts. */
  private readonly platform: NodeJS.Platform;
  /** Native helper executable path resolved by DesktopApplication. */
  private readonly helperPath: string;
  /** Injectable command runner; production uses execFile without a shell. */
  private readonly runner: SystemProxyCommandRunner;
  /** Optional crash-safe journal supplied by the DesktopApplication. */
  private readonly journal: SystemProxyJournalStore | null;

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

  /** Read current settings and derive whether they are still exactly owned by this process. */
  async status(): Promise<SystemProxyStatus> {
    if (!this.supported()) {
      return WindowsSystemProxyService.unsupportedStatus();
    }
    const current = await this.readSettings();
    const owned = this.ownedSettings !== null &&
      WindowsSystemProxyService.equalSettings(current, this.ownedSettings);
    if (this.ownedSettings !== null && !owned) {
      this.ownershipLost = true;
    }
    return WindowsSystemProxyService.toStatus(current, owned, this.ownershipLost);
  }

  /** Snapshot current values, write the loopback proxy and verify exact helper readback. */
  async enable(host: string, port: number): Promise<SystemProxyStatus> {
    this.assertSupported();
    const authority = WindowsSystemProxyService.loopbackAuthority(host, port);
    const current = await this.readSettings();

    if (this.ownedSettings !== null) {
      if (!WindowsSystemProxyService.equalSettings(current, this.ownedSettings)) {
        this.ownershipLost = true;
        throw new SystemProxyError(
          'System proxy ownership was lost because settings were modified externally.',
        );
      }
      return WindowsSystemProxyService.toStatus(current, true, false);
    }

    const target = WindowsSystemProxyService.ownedProxySettings(current, authority);
    this.originalSettings = current;
    this.upstream = toUpstreamProxyConfig(current, authority);
    await this.journal?.begin('win32', current, target);
    await this.writeSettings(target);
    const written = await this.readSettings();
    if (!WindowsSystemProxyService.equalSettings(written, target)) {
      this.originalSettings = null;
      throw new SystemProxyError('WinINet proxy settings did not match after write.');
    }
    this.ownedSettings = written;
    await this.journal?.markOwned('win32');
    this.ownershipLost = false;
    return WindowsSystemProxyService.toStatus(written, true, false);
  }

  /** Restore only when current settings still exactly equal this process's written values. */
  async restore(): Promise<SystemProxyRestoreResult> {
    if (!this.supported()) {
      return { restored: false, reason: 'not-owned', status: WindowsSystemProxyService.unsupportedStatus() };
    }
    if (!this.originalSettings || !this.ownedSettings) {
      if (this.journal) {
        return this.repairFromJournal();
      }
      return {
        restored: false,
        reason: 'not-owned',
        status: await this.status(),
      };
    }

    return this.restoreOwned(this.originalSettings, this.ownedSettings);
  }

  /** 接管前读到的用户原有上游代理；null 表示原本就直连。 */
  detectedUpstream(): UpstreamProxyConfig | null {
    return this.upstream;
  }

  /** Recover ownership from disk and perform the same guarded restoration decision. */
  async repair(): Promise<SystemProxyRestoreResult> {
    if (!this.supported()) {
      return { restored: false, reason: 'not-owned', status: WindowsSystemProxyService.unsupportedStatus() };
    }
    if (this.originalSettings && this.ownedSettings) {
      return this.restoreOwned(this.originalSettings, this.ownedSettings);
    }
    if (this.journal) {
      return this.repairFromJournal();
    }
    return { restored: false, reason: 'not-owned', status: await this.status() };
  }

  /** Parse one Windows journal and restore only from its exact owned value. */
  private async repairFromJournal(): Promise<SystemProxyRestoreResult> {
    const record = await this.journal?.read();
    if (!record) {
      return { restored: false, reason: 'not-owned', status: await this.status() };
    }
    if (record.platform !== 'win32') {
      throw new SystemProxyError('System proxy journal belongs to another platform.');
    }
    const original = WindowsSystemProxyService.parseSettings(record.original);
    const owned = WindowsSystemProxyService.parseSettings(record.owned);
    const current = await this.readSettings();
    if (WindowsSystemProxyService.equalSettings(current, original)) {
      await this.journal?.clear();
      this.originalSettings = null;
      this.ownedSettings = null;
      this.ownershipLost = false;
      return {
        restored: false,
        reason: 'not-owned',
        status: WindowsSystemProxyService.toStatus(current, false, false),
      };
    }
    this.originalSettings = original;
    this.ownedSettings = owned;
    return this.restoreOwned(original, owned, current);
  }

  /** Restore one known snapshot after an exact current-versus-owned comparison. */
  private async restoreOwned(
    original: WinInetProxySettings,
    owned: WinInetProxySettings,
    knownCurrent?: WinInetProxySettings,
  ): Promise<SystemProxyRestoreResult> {
    const current = knownCurrent ?? await this.readSettings();
    if (!WindowsSystemProxyService.equalSettings(current, owned)) {
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
    this.originalSettings = null;
    this.ownedSettings = null;
    this.upstream = null;
    this.ownershipLost = false;
    return { restored: true, status: WindowsSystemProxyService.toStatus(restored, false, false) };
  }

  /** Invoke the helper's read-only command and validate its bounded JSON result. */
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

  /** Encode nullable strings without shell interpolation and invoke the helper's set command. */
  private async writeSettings(settings: WinInetProxySettings): Promise<void> {
    await this.run([
      'set',
      String(settings.flags),
      WindowsSystemProxyService.encodeNullable(settings.proxyServer),
      WindowsSystemProxyService.encodeNullable(settings.bypassList),
      WindowsSystemProxyService.encodeNullable(settings.pacUrl),
    ]);
  }

  /** Execute one helper command and contain stderr/stdout in a bounded error. */
  private async run(args: readonly string[]): Promise<SystemProxyCommandResult> {
    const result = await this.runner.run(this.helperPath, args);
    if (result.code !== 0) {
      const detail = result.stderr || result.stdout || 'unknown error';
      throw new SystemProxyError(
        `WinINet helper failed (exit ${result.code}): ${detail}`,
      );
    }
    return result;
  }

  /** Reject mutating calls on unsupported platforms. */
  private assertSupported(): void {
    if (!this.supported()) {
      throw new SystemProxyError(
        `Windows system proxy is not supported on ${this.platform}.`,
      );
    }
  }

  /** Build the loopback-owned WinINet settings from the current snapshot. */
  private static ownedProxySettings(
    current: WinInetProxySettings,
    authority: string,
  ): WinInetProxySettings {
    const flags = (
      current.flags &
      ~(
        WindowsSystemProxyService.PROXY_TYPE_PROXY |
        WindowsSystemProxyService.PROXY_TYPE_AUTO_PROXY_URL |
        WindowsSystemProxyService.PROXY_TYPE_AUTO_DETECT
      )
    ) | WindowsSystemProxyService.PROXY_TYPE_DIRECT |
      WindowsSystemProxyService.PROXY_TYPE_PROXY;
    return {
      flags,
      proxyEnabled: true,
      autoDetect: false,
      proxyServer: `http=${authority};https=${authority}`,
      bypassList: WindowsSystemProxyService.withRequiredBypass(current.bypassList),
      pacUrl: null,
    };
  }

  /** Preserve user entries and keep traffic that is incompatible with interception direct. */
  private static withRequiredBypass(value: string | null): string {
    const entries = (value ?? '')
      .split(';')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    // `<local>` only covers dotless hostnames, so loopback literals need their own entry.
    // IPv6 must be bracketed here - WinINet reads a bare `::1` as host:port and rejects the write.
    return [...new Set([
      ...entries,
      'localhost',
      '127.*',
      '[::1]',
      '<local>',
    ])].join(';');
  }

  /** Validate a loopback host/port and format the WinINet authority. */
  private static loopbackAuthority(host: string, port: number): string {
    if (host !== '127.0.0.1' && host !== '::1') {
      throw new SystemProxyError('System proxy requires a loopback listener.');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new SystemProxyError('System proxy port is invalid.');
    }
    return host === '::1' ? `[::1]:${port}` : `${host}:${port}`;
  }

  /** Validate one bounded WinINet helper JSON result. */
  private static parseSettings(value: unknown): WinInetProxySettings {
    if (typeof value !== 'object' || value === null) {
      throw new SystemProxyError('WinINet helper result must be an object.');
    }
    const record = value as Record<string, unknown>;
    if (
      !Number.isInteger(record.flags) ||
      (record.flags as number) < 0 ||
      typeof record.proxyEnabled !== 'boolean' ||
      typeof record.autoDetect !== 'boolean'
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

  /** Validate one nullable helper string field without changing its content. */
  private static nullableString(value: unknown, name: string): string | null {
    if (value === null) {
      return null;
    }
    if (typeof value !== 'string') {
      throw new SystemProxyError(`WinINet helper result ${name} is invalid.`);
    }
    return value;
  }

  /** Base64-encode a nullable string for the helper's set command. */
  private static encodeNullable(value: string | null): string {
    return value === null ? '-' : Buffer.from(value, 'utf8').toString('base64');
  }

  /** Compare only the ownership-relevant WinINet fields. */
  private static equalSettings(
    left: WinInetProxySettings,
    right: WinInetProxySettings,
  ): boolean {
    return left.flags === right.flags &&
      left.proxyServer === right.proxyServer &&
      left.bypassList === right.bypassList &&
      left.pacUrl === right.pacUrl;
  }

  /** Map WinINet settings to the public system-proxy status. */
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

  /** Fixed unsupported-platform status. */
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