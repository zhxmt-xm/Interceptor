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
