import type { CaptureFilter } from './interfaces';

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

/** 空过滤条件初值：无分段、无搜索、无结构化条件。 */
export const EMPTY_FILTER: CaptureFilter = {
  segment: 'all',
  search: '',
  method: [],
  status: [],
};
