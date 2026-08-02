import { SystemProxyError } from './system-proxy-error';
import type { UpstreamProxyConfig } from '@interceptor/core-protocol';
import type {
  MacosSystemProxySnapshot,
  MacosSystemProxyServiceOptions,
  SystemProxyCommandResult,
  SystemProxyCommandRunner,
  SystemProxyJournalStore,
  SystemProxyRestoreResult,
  SystemProxyService,
  SystemProxyStatus,
} from '../interfaces';
import { systemProxyCommandRunner } from '../utils';

/** macOS SystemConfiguration proxy ownership across all active network services. */
export class MacosSystemProxyService implements SystemProxyService {
  /** Original multi-service snapshot captured immediately before enable. */
  private originalSnapshot: MacosSystemProxySnapshot | null = null;
  /** Exact helper readback after enable; restoration requires an exact match. */
  private ownedSnapshot: MacosSystemProxySnapshot | null = null;
  /** Sticky indication that another actor changed any managed service. */
  private ownershipLost = false;
  /** Runtime platform used to report unsupported hosts explicitly. */
  private readonly platform: NodeJS.Platform;
  /** Swift helper path resolved by DesktopApplication. */
  private readonly helperPath: string;
  /** Injectable command runner; production uses execFile without a shell. */
  private readonly runner: SystemProxyCommandRunner;
  /** Optional crash-safe journal supplied by the DesktopApplication. */
  private readonly journal: SystemProxyJournalStore | null;

  /** Configure the platform, helper path and command runner. */
  constructor(options: MacosSystemProxyServiceOptions) {
    this.platform = options.platform ?? process.platform;
    this.helperPath = options.helperPath;
    this.runner = options.runner ?? systemProxyCommandRunner;
    this.journal = options.journal ?? null;
  }

  /** Whether this service can manage macOS SystemConfiguration preferences. */
  supported(): boolean {
    return this.platform === 'darwin';
  }

  /** Read all active services and derive current ownership. */
  async status(): Promise<SystemProxyStatus> {
    if (!this.supported()) {
      return MacosSystemProxyService.unsupportedStatus();
    }
    const current = await this.readSnapshot();
    const owned = this.ownedSnapshot !== null &&
      MacosSystemProxyService.equalSnapshots(current, this.ownedSnapshot);
    if (this.ownedSnapshot !== null && !owned) {
      this.ownershipLost = true;
    }
    return MacosSystemProxyService.toStatus(current, owned, this.ownershipLost);
  }

  /** Snapshot all active services, apply loopback HTTP/HTTPS and verify readback. */
  async enable(host: string, port: number): Promise<SystemProxyStatus> {
    this.assertSupported();
    MacosSystemProxyService.assertLoopback(host, port);
    const current = await this.readSnapshot();

    if (this.ownedSnapshot !== null) {
      if (!MacosSystemProxyService.equalSnapshots(current, this.ownedSnapshot)) {
        this.ownershipLost = true;
        throw new SystemProxyError(
          'System proxy ownership was lost because settings were modified externally.',
        );
      }
      return MacosSystemProxyService.toStatus(current, true, false);
    }
    if (current.services.length === 0) {
      throw new SystemProxyError('macOS has no active network services to configure.');
    }

    const target = MacosSystemProxyService.createOwnedSnapshot(current, host, port);
    this.originalSnapshot = current;
    await this.journal?.begin('darwin', current, target);
    await this.writeSnapshot(target);
    const written = await this.readSnapshot();
    if (!MacosSystemProxyService.equalSnapshots(written, target)) {
      this.originalSnapshot = null;
      throw new SystemProxyError(
        'macOS proxy settings did not match after write.',
      );
    }
    this.ownedSnapshot = written;
    await this.journal?.markOwned('darwin');
    this.ownershipLost = false;
    return MacosSystemProxyService.toStatus(written, true, false);
  }

  /**
   * macOS 尚未接入上游代理检测；快照是按网络服务分开存的，多服务
   * （Wi-Fi / 以太网 / VPN）可能各自配不同代理，需先定义合并语义。
   */
  detectedUpstream(): UpstreamProxyConfig | null {
    return null;
  }

  /** Restore every service only while all current values remain exactly owned. */
  async restore(): Promise<SystemProxyRestoreResult> {
    if (!this.supported()) {
      return {
        restored: false,
        reason: 'not-owned',
        status: MacosSystemProxyService.unsupportedStatus(),
      };
    }
    if (!this.originalSnapshot || !this.ownedSnapshot) {
      if (this.journal) {
        return this.repairFromJournal();
      }
      return {
        restored: false,
        reason: 'not-owned',
        status: await this.status(),
      };
    }

    return this.restoreOwned(this.originalSnapshot, this.ownedSnapshot);
  }

  /** Recover ownership from disk and perform the same guarded restoration decision. */
  async repair(): Promise<SystemProxyRestoreResult> {
    if (!this.supported()) {
      return {
        restored: false,
        reason: 'not-owned',
        status: MacosSystemProxyService.unsupportedStatus(),
      };
    }
    if (this.originalSnapshot && this.ownedSnapshot) {
      return this.restoreOwned(this.originalSnapshot, this.ownedSnapshot);
    }
    if (this.journal) {
      return this.repairFromJournal();
    }
    return { restored: false, reason: 'not-owned', status: await this.status() };
  }

  /** Parse one macOS journal and restore only from its exact multi-service owned value. */
  private async repairFromJournal(): Promise<SystemProxyRestoreResult> {
    const record = await this.journal?.read();
    if (!record) {
      return { restored: false, reason: 'not-owned', status: await this.status() };
    }
    if (record.platform !== 'darwin') {
      throw new SystemProxyError('System proxy journal belongs to another platform.');
    }
    const original = MacosSystemProxyService.parseSnapshot(record.original);
    const owned = MacosSystemProxyService.parseSnapshot(record.owned);
    const current = await this.readSnapshot();
    if (MacosSystemProxyService.equalSnapshots(current, original)) {
      await this.journal?.clear();
      this.originalSnapshot = null;
      this.ownedSnapshot = null;
      this.ownershipLost = false;
      return {
        restored: false,
        reason: 'not-owned',
        status: MacosSystemProxyService.toStatus(current, false, false),
      };
    }
    this.originalSnapshot = original;
    this.ownedSnapshot = owned;
    return this.restoreOwned(original, owned, current);
  }

  /** Restore one known multi-service snapshot after an exact ownership comparison. */
  private async restoreOwned(
    original: MacosSystemProxySnapshot,
    owned: MacosSystemProxySnapshot,
    knownCurrent?: MacosSystemProxySnapshot,
  ): Promise<SystemProxyRestoreResult> {
    const current = knownCurrent ?? await this.readSnapshot();
    if (!MacosSystemProxyService.equalSnapshots(current, owned)) {
      this.ownershipLost = true;
      return {
        restored: false,
        reason: 'externally-modified',
        status: MacosSystemProxyService.toStatus(current, false, true),
      };
    }

    await this.writeSnapshot(original);
    const restored = await this.readSnapshot();
    if (!MacosSystemProxyService.equalSnapshots(restored, original)) {
      throw new SystemProxyError(
        'macOS proxy settings did not match after restore.',
      );
    }
    await this.journal?.clear();
    this.originalSnapshot = null;
    this.ownedSnapshot = null;
    this.ownershipLost = false;
    return {
      restored: true,
      status: MacosSystemProxyService.toStatus(restored, false, false),
    };
  }

  /** Invoke the helper's read command and validate its JSON snapshot structure. */
  private async readSnapshot(): Promise<MacosSystemProxySnapshot> {
    const result = await this.run(['get']);
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw new SystemProxyError('macOS proxy helper returned invalid JSON.');
    }
    return MacosSystemProxyService.parseSnapshot(parsed);
  }

  /** Encode one complete snapshot and ask the helper to commit it atomically. */
  private async writeSnapshot(snapshot: MacosSystemProxySnapshot): Promise<void> {
    const json = JSON.stringify(snapshot);
    await this.run(['set', Buffer.from(json, 'utf8').toString('base64')]);
  }

  /** Execute one helper command and preserve its complete error output. */
  private async run(args: readonly string[]): Promise<SystemProxyCommandResult> {
    const result = await this.runner.run(this.helperPath, args);
    if (result.code !== 0) {
      const detail = result.stderr || result.stdout || 'unknown error';
      throw new SystemProxyError(
        `macOS proxy helper failed (exit ${result.code}): ${detail}`,
      );
    }
    return result;
  }

  /** Reject mutating calls on unsupported platforms. */
  private assertSupported(): void {
    if (!this.supported()) {
      throw new SystemProxyError(
        `macOS system proxy is not supported on ${this.platform}.`,
      );
    }
  }

  /** Validate and normalize a helper snapshot into stable service order. */
  private static parseSnapshot(value: unknown): MacosSystemProxySnapshot {
    if (typeof value !== 'object' || value === null) {
      throw new SystemProxyError('macOS proxy snapshot must be an object.');
    }
    const services = (value as Record<string, unknown>).services;
    if (!Array.isArray(services)) {
      throw new SystemProxyError('macOS proxy snapshot has invalid services.');
    }

    const identifiers = new Set<string>();
    const parsed = services.map((service) => {
      if (typeof service !== 'object' || service === null) {
        throw new SystemProxyError('macOS network service must be an object.');
      }
      const record = service as Record<string, unknown>;
      if (
        typeof record.id !== 'string' ||
        record.id.length === 0 ||
        typeof record.name !== 'string' ||
        typeof record.settings !== 'object' ||
        record.settings === null ||
        Array.isArray(record.settings)
      ) {
        throw new SystemProxyError('macOS network service fields are invalid.');
      }
      if (identifiers.has(record.id)) {
        throw new SystemProxyError('macOS proxy snapshot has duplicate services.');
      }
      identifiers.add(record.id);
      this.assertJsonValue(record.settings);
      return {
        id: record.id,
        name: record.name,
        settings: record.settings as Record<string, unknown>,
      };
    });
    parsed.sort((left, right) => left.id.localeCompare(right.id));
    return { services: parsed };
  }

  /** Validate recursive JSON value types accepted from SystemConfiguration. */
  private static assertJsonValue(value: unknown): void {
    if (
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    ) {
      return;
    }
    if (typeof value === 'string') {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        this.assertJsonValue(item);
      }
      return;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      for (const [, item] of entries) {
        this.assertJsonValue(item);
      }
      return;
    }
    throw new SystemProxyError('macOS proxy snapshot contains an invalid value.');
  }

  /** Build owned settings for every active service while retaining unrelated keys. */
  private static createOwnedSnapshot(
    snapshot: MacosSystemProxySnapshot,
    host: string,
    port: number,
  ): MacosSystemProxySnapshot {
    return {
      services: snapshot.services.map((service) => {
        const settings = structuredClone(service.settings) as Record<string, unknown>;
        settings.HTTPEnable = 1;
        settings.HTTPProxy = host;
        settings.HTTPPort = port;
        settings.HTTPSEnable = 1;
        settings.HTTPSProxy = host;
        settings.HTTPSPort = port;
        settings.SOCKSEnable = 0;
        settings.ProxyAutoConfigEnable = 0;
        settings.ProxyAutoDiscoveryEnable = 0;
        settings.ExcludeSimpleHostnames = 1;
        settings.ExceptionsList = this.withLocalBypass(settings.ExceptionsList);
        return { ...service, settings };
      }),
    };
  }

  /** Preserve existing bypass entries and ensure loopback/simple hosts stay direct. */
  private static withLocalBypass(value: unknown): readonly string[] {
    const entries = Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
    return [...new Set([...entries, 'localhost', '127.0.0.1', '::1', '*.local'])];
  }

  /** Compare service identifiers and settings independent of dictionary key order. */
  private static equalSnapshots(
    left: MacosSystemProxySnapshot,
    right: MacosSystemProxySnapshot,
  ): boolean {
    if (left.services.length !== right.services.length) {
      return false;
    }
    return left.services.every((service, index) => {
      const other = right.services[index];
      return other !== undefined &&
        service.id === other.id &&
        this.canonicalJson(service.settings) === this.canonicalJson(other.settings);
    });
  }

  /** Serialize JSON with stable dictionary ordering for exact ownership comparison. */
  private static canonicalJson(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    }
    if (typeof value === 'object' && value !== null) {
      const entries = Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right));
      return `{${entries.map(([key, item]) =>
        `${JSON.stringify(key)}:${this.canonicalJson(item)}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  /** Convert a multi-service snapshot into the existing bounded public status. */
  private static toStatus(
    snapshot: MacosSystemProxySnapshot,
    owned: boolean,
    ownershipLost: boolean,
  ): SystemProxyStatus {
    const settings = snapshot.services.map((service) => service.settings);
    const enabled = settings.some((item) =>
      this.enabled(item.HTTPEnable) ||
      this.enabled(item.HTTPSEnable) ||
      this.enabled(item.SOCKSEnable) ||
      this.enabled(item.ProxyAutoConfigEnable) ||
      this.enabled(item.ProxyAutoDiscoveryEnable));
    const proxyServers = settings
      .map((item) => this.proxyServer(item))
      .filter((item): item is string => item !== null);
    const bypassEntries = settings.flatMap((item) =>
      Array.isArray(item.ExceptionsList)
        ? item.ExceptionsList.filter((entry): entry is string => typeof entry === 'string')
        : []);
    const pacUrl = settings.find((item) =>
      this.enabled(item.ProxyAutoConfigEnable) &&
      typeof item.ProxyAutoConfigURLString === 'string')?.ProxyAutoConfigURLString;
    return {
      supported: true,
      enabled,
      owned,
      ownershipLost,
      proxyServer: [...new Set(proxyServers)].join(' | ') || null,
      bypassList: [...new Set(bypassEntries)].join(', ') || null,
      pacUrl: typeof pacUrl === 'string' ? pacUrl : null,
      autoDetect: settings.some((item) => this.enabled(item.ProxyAutoDiscoveryEnable)),
    };
  }

  /** Format enabled HTTP and HTTPS endpoints from one service. */
  private static proxyServer(settings: Readonly<Record<string, unknown>>): string | null {
    const endpoints: string[] = [];
    if (
      this.enabled(settings.HTTPEnable) &&
      typeof settings.HTTPProxy === 'string' &&
      Number.isInteger(settings.HTTPPort)
    ) {
      endpoints.push(`http=${settings.HTTPProxy}:${String(settings.HTTPPort)}`);
    }
    if (
      this.enabled(settings.HTTPSEnable) &&
      typeof settings.HTTPSProxy === 'string' &&
      Number.isInteger(settings.HTTPSPort)
    ) {
      endpoints.push(`https=${settings.HTTPSProxy}:${String(settings.HTTPSPort)}`);
    }
    return endpoints.join(';') || null;
  }

  /** Interpret SystemConfiguration numeric or Boolean enable flags. */
  private static enabled(value: unknown): boolean {
    return value === true || value === 1;
  }

  /** Enforce the loopback-only listener invariant shared with Windows. */
  private static assertLoopback(host: string, port: number): void {
    if (host !== '127.0.0.1' && host !== '::1') {
      throw new SystemProxyError('System proxy requires a loopback listener.');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new SystemProxyError('System proxy port is invalid.');
    }
  }

  /** Return a stable unavailable status on non-macOS platforms. */
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