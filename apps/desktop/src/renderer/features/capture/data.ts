export const INSPECTOR_TABS = [
  { id: 'headers', label: 'Headers' },
  { id: 'request', label: 'Request' },
  { id: 'response', label: 'Response' },
  { id: 'timing', label: 'Timing' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'tls', label: 'TLS' },
] as const;

export const WEBSOCKET_INSPECTOR_TABS = [
  { id: 'headers', label: 'Headers' },
  { id: 'messages', label: 'Messages' },
  { id: 'timing', label: 'Timing' },
  { id: 'tls', label: 'TLS' },
] as const;

export const GRPC_INSPECTOR_TABS = [
  { id: 'headers', label: 'Headers' },
  { id: 'grpc', label: 'Messages' },
  { id: 'timing', label: 'Timing' },
  { id: 'tls', label: 'TLS' },
] as const;

export type InspectorTab =
  | (typeof INSPECTOR_TABS)[number]['id']
  | (typeof WEBSOCKET_INSPECTOR_TABS)[number]['id']
  | (typeof GRPC_INSPECTOR_TABS)[number]['id'];
