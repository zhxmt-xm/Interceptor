export const INSPECTOR_TABS = [
  { id: 'headers', label: 'Headers' },
  { id: 'request', label: 'Request' },
  { id: 'response', label: 'Response' },
  { id: 'timing', label: 'Timing' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'tls', label: 'TLS' },
] as const;

export type InspectorTab = (typeof INSPECTOR_TABS)[number]['id'];
