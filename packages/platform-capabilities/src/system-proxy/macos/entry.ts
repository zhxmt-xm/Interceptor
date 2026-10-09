import { SystemProxyError } from '../internal/errors';
import type { UpstreamProxyConfig } from '@interceptor/core-protocol';
import type { MacosSystemProxySnapshot, MacosSystemProxyServiceOptions, SystemProxyJournalStore, SystemProxyRestoreResult, SystemProxyService, SystemProxyStatus, SystemProxyUpstreamSource } from '../interfaces';
import { parseMacosSystemProxySnapshot } from '../../helper/macos/utils';
import { MacosHelperServiceClient } from '../../helper/macos/helper-client';
import { toMacosUpstreamProxyConfig } from './upstream';

/** macOS SystemConfiguration proxy ownership across all active network services. */
export class MacosSystemProxyService implements SystemProxyService {
  /** Original multi-service snapshot captured immediately before enable. */
  private originalSnapshot: MacosSystemProxySnapshot | null = null;
  /** Exact helper readback after enable; restoration requires an exact match. */
  private ownedSnapshot: MacosSystemProxySnapshot | null = null;
  /** Effective proxy settings captured before takeover, also retained in the crash journal. */
  private effectiveProxySettings: Record<string, unknown> | null = null;
  /** Sticky indication that another actor changed any managed service. */
  private ownershipLost = false;
  /** Runtime platform used to report unsupported hosts explicitly. */
  private readonly platform: NodeJS.Platform;
  private readonly macosHelperServiceClient: MacosHelperServiceClient;
  /** Optional crash-safe journal supplied by the DesktopApplication. */
  private readonly journal: SystemProxyJournalStore | null;

  /** Configure the platform, helper path and command runner. */
  constructor(options: MacosSystemProxyServiceOptions) {
    this.platform = options.platform ?? process.platform;
    this.macosHelperServiceClient = options.macosHelperServiceClient ?? new MacosHelperServiceClient();
    this.journal = options.journal ?? null;
  }

  /** Whether this service can manage macOS SystemConfiguration preferences. */
  supported(): boolean {
    return this.platform === 'darwin';
  }

  /** Read all active services and derive current ownership. */
  async status(canUpdateOwnership: () => boolean = () => true): Promise<SystemProxyStatus> {
    if (!this.supported()) {
      return MacosSystemProxyService.unsupportedStatus();
    }
    const current = await this.readSnapshot();
    const owned = this.ownedSnapshot !== null &&
      MacosSystemProxyService.equalSnapshots(current, this.ownedSnapshot);
    if (this.ownedSnapshot !== null && !owned && canUpdateOwnership()) {
      this.ownershipLost = true;
    }
    return MacosSystemProxyService.toStatus(current, owned, this.ownershipLost);
  }

  /** Load the existing crash journal without rewriting an unchanged owned snapshot. */
  async recoverAfterCrash(): Promise<SystemProxyRestoreResult> {
    if (!this.supported()) {
      return {
        restored: false,
        reason: 'not-owned',
        status: MacosSystemProxyService.unsupportedStatus(),
      };
    }
    const current = await this.readSnapshot();
    const record = await this.journal?.read();
    if (!record) {
      return {
        restored: false,
        reason: 'not-owned',
        status: MacosSystemProxyService.toStatus(current, false, false),
      };
    }
    const original = parseMacosSystemProxySnapshot(record.original);
    const owned = parseMacosSystemProxySnapshot(record.owned);
    if (MacosSystemProxyService.equalSnapshots(current, owned)) {
      this.originalSnapshot = original;
      this.ownedSnapshot = owned;
      this.effectiveProxySettings = record.effectiveProxies;
      this.ownershipLost = false;
      return {
        restored: false,
        status: MacosSystemProxyService.toStatus(current, true, false),
      };
    }
    await this.journal?.clear();
    this.originalSnapshot = null;
    this.ownedSnapshot = null;
    this.effectiveProxySettings = null;
    if (MacosSystemProxyService.equalSnapshots(current, original)) {
      this.ownershipLost = false;
      return {
        restored: false,
        reason: 'not-owned',
        status: MacosSystemProxyService.toStatus(current, false, false),
      };
    }
    this.ownershipLost = true;
    return {
      restored: false,
      reason: 'externally-modified',
      status: MacosSystemProxyService.toStatus(current, false, true),
    };
  }

  /** Snapshot all active services, apply loopback HTTP/HTTPS and verify readback. */
  async enable(host: string, port: number, beforeTakeover?: (source: SystemProxyUpstreamSource) => Promise<void>): Promise<SystemProxyStatus> {
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
      await beforeTakeover?.(await this.readUpstreamSource());
      return MacosSystemProxyService.toStatus(current, true, false);
    }
    if (current.services.length === 0) {
      throw new SystemProxyError('macOS has no active network services to configure.');
    }

    const effectiveProxies = await this.macosHelperServiceClient.readEffectiveSystemProxySettings();
    if (beforeTakeover) await beforeTakeover({ platform: 'darwin', settings: effectiveProxies });
    else toMacosUpstreamProxyConfig(effectiveProxies, port);
    const target = MacosSystemProxyService.createOwnedSnapshot(current, host, port);
    this.originalSnapshot = current;
    this.effectiveProxySettings = effectiveProxies;
    await this.journal?.save(current, target, effectiveProxies);
    await this.writeSnapshot(current, target);
    const written = await this.readSnapshot();
    if (!MacosSystemProxyService.equalSnapshots(written, target)) {
      this.originalSnapshot = null;
      throw new SystemProxyError(
        'macOS proxy settings did not match after write.',
      );
    }
    this.ownedSnapshot = written;
    this.ownershipLost = false;
    return MacosSystemProxyService.toStatus(written, true, false);
  }

  /** Resolve only the saved effective proxy, never the currently owned system proxy. */
  detectedUpstream(): UpstreamProxyConfig | null {
    if (!this.effectiveProxySettings || !this.ownedSnapshot) return null;
    const port = this.ownedSnapshot.services[0]?.settings.HTTPPort;
    if (typeof port !== 'number') throw new SystemProxyError('macOS owned proxy port is missing.');
    return toMacosUpstreamProxyConfig(this.effectiveProxySettings, port);
  }

  /** Use the captured original while owned, or read the current system configuration before takeover. */
  async readUpstreamSource(): Promise<SystemProxyUpstreamSource> {
    this.assertSupported();
    return {
      platform: 'darwin',
      settings: this.effectiveProxySettings
        ? structuredClone(this.effectiveProxySettings)
        : await this.macosHelperServiceClient.readEffectiveSystemProxySettings(),
    };
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


  /** Parse one macOS journal and restore only from its exact multi-service owned value. */
  private async repairFromJournal(): Promise<SystemProxyRestoreResult> {
    const record = await this.journal?.read();
    if (!record) {
      return { restored: false, reason: 'not-owned', status: await this.status() };
    }
    const original = parseMacosSystemProxySnapshot(record.original);
    const owned = parseMacosSystemProxySnapshot(record.owned);
    const current = await this.readSnapshot();
    if (MacosSystemProxyService.equalSnapshots(current, original)) {
      await this.journal?.clear();
      this.originalSnapshot = null;
      this.ownedSnapshot = null;
      this.effectiveProxySettings = null;
      this.ownershipLost = false;
      return {
        restored: false,
        reason: 'not-owned',
        status: MacosSystemProxyService.toStatus(current, false, false),
      };
    }
    this.originalSnapshot = original;
    this.ownedSnapshot = owned;
    this.effectiveProxySettings = record.effectiveProxies;
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
      await this.journal?.clear();
      this.originalSnapshot = null;
      this.ownedSnapshot = null;
      this.effectiveProxySettings = null;
      this.ownershipLost = true;
      return {
        restored: false,
        reason: 'externally-modified',
        status: MacosSystemProxyService.toStatus(current, false, true),
      };
    }

    await this.writeSnapshot(current, original);
    const restored = await this.readSnapshot();
    if (!MacosSystemProxyService.equalSnapshots(restored, original)) {
      throw new SystemProxyError(
        'macOS proxy settings did not match after restore.',
      );
    }
    await this.journal?.clear();
    this.originalSnapshot = null;
    this.ownedSnapshot = null;
    this.effectiveProxySettings = null;
    this.ownershipLost = false;
    return {
      restored: true,
      status: MacosSystemProxyService.toStatus(restored, false, false),
    };
  }

  /** Invoke the helper's read command and validate its JSON snapshot structure. */
  private async readSnapshot(): Promise<MacosSystemProxySnapshot> {
    return parseMacosSystemProxySnapshot(await this.macosHelperServiceClient.readSystemProxySnapshot());
  }

  private async writeSnapshot(expectedSnapshot: MacosSystemProxySnapshot, snapshot: MacosSystemProxySnapshot): Promise<void> {
    await this.macosHelperServiceClient.replaceSystemProxySnapshot(expectedSnapshot, snapshot);
  }

  /** Reject mutating calls on unsupported platforms. */
  private assertSupported(): void {
    if (!this.supported()) {
      throw new SystemProxyError(
        `macOS system proxy is not supported on ${this.platform}.`,
      );
    }
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