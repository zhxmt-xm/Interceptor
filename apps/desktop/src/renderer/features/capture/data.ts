export const INSPECTOR_TABS = [
  { id: 'headers', labelKey: 'capture.headers' },
  { id: 'request', labelKey: 'capture.request' },
  { id: 'response', labelKey: 'capture.response' },
  { id: 'timing', labelKey: 'capture.timing' },
  { id: 'cookies', labelKey: 'capture.cookies' },
  { id: 'tls', labelKey: 'TLS' },
] as const;

export const WEBSOCKET_INSPECTOR_TABS = [
  { id: 'headers', labelKey: 'capture.headers' },
  { id: 'messages', labelKey: 'capture.messages' },
  { id: 'timing', labelKey: 'capture.timing' },
  { id: 'tls', labelKey: 'TLS' },
] as const;

export const GRPC_INSPECTOR_TABS = [
  { id: 'headers', labelKey: 'capture.headers' },
  { id: 'grpc', labelKey: 'capture.messages' },
  { id: 'timing', labelKey: 'capture.timing' },
  { id: 'tls', labelKey: 'TLS' },
] as const;

export const TLS_TUNNEL_INSPECTOR_TABS = [
  { id: 'tunnel', labelKey: 'capture.tlsTunnel' },
] as const;

export type InspectorTab =
  | (typeof INSPECTOR_TABS)[number]['id']
  | (typeof WEBSOCKET_INSPECTOR_TABS)[number]['id']
  | (typeof GRPC_INSPECTOR_TABS)[number]['id']
  | (typeof TLS_TUNNEL_INSPECTOR_TABS)[number]['id'];

/** Preserve the user's tab across request selection unless the new request cannot show it. */
export function retainInspectorTab(
  current: InspectorTab,
  available: readonly { id: InspectorTab }[],
  fallback: InspectorTab,
): InspectorTab {
  return available.some((item) => item.id === current) ? current : fallback;
}
