import type { UpstreamProxySettings } from '@interceptor/core-protocol';

export type UpstreamRoute =
  | { kind: 'unavailable' }
  | { kind: 'direct' }
  | { kind: 'proxy'; authority: string }
  | { kind: 'pac'; url: string }
  | { kind: 'per-protocol'; http: string | null; https: string | null };

/** Saved intent and effective routing are distinct from an in-progress edit or failed Apply. */
export interface UpstreamSettingsSnapshot {
  settings: UpstreamProxySettings;
  operation: 'idle' | 'applying' | 'discovering';
  route: UpstreamRoute;
  health: 'unknown' | 'reachable' | 'unreachable' | 'not-applicable';
  error: { kind: 'discovery' | 'connection'; message: string } | null;
}

/** Public system proxy status; excludes helper paths and raw snapshots. */
export interface SystemProxyStatus {
  supported: boolean;
  enabled: boolean;
  owned: boolean;
  ownershipLost: boolean;
  proxyServer: string | null;
  bypassList: string | null;
  pacUrl: string | null;
  autoDetect: boolean;
  /** Detected upstream authority without credentials. */
  upstreamProxy: string | null;
  upstreamReachable: boolean;
}

export interface SystemProxyRestoreResult {
  restored: boolean;
  reason?: 'not-owned' | 'externally-modified';
  status: SystemProxyStatus;
}
