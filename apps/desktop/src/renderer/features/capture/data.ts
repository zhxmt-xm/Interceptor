import type { HttpMethod } from '../../components';

export type StatusKind = 'ok' | 'warn' | 'err' | 'info2';

export interface TrafficRow {
  method: HttpMethod;
  host: string;
  path: string;
  secure: boolean;
  status: StatusKind;
  code: string;
  proto: string;
  type: string;
  size: string;
  time: string;
}

export const ROWS: TrafficRow[] = [
  { method: 'get', host: 'api.github.com', path: '/user', secure: true, status: 'ok', code: '200', proto: 'h2', type: 'json', size: '1.2 KB', time: '142 ms' },
  { method: 'post', host: 'login.microsoftonline.com', path: '/common/oauth2/v2.0/token', secure: true, status: 'ok', code: '200', proto: 'h2', type: 'json', size: '3.4 KB', time: '210 ms' },
  { method: 'get', host: 'cdn.jsdelivr.net', path: '/npm/react@18/umd/react.min.js', secure: true, status: 'info2', code: '304', proto: 'h2', type: 'js', size: '0 B', time: '18 ms' },
  { method: 'get', host: 'fonts.gstatic.com', path: '/s/inter/v13/UcC.woff2', secure: true, status: 'ok', code: '200', proto: 'h2', type: 'font', size: '42 KB', time: '33 ms' },
  { method: 'post', host: 'api.stripe.com', path: '/v1/charges', secure: true, status: 'warn', code: '401', proto: 'h1', type: 'json', size: '220 B', time: '89 ms' },
  { method: 'get', host: 'graph.microsoft.com', path: '/v1.0/me/messages', secure: true, status: 'ok', code: '200', proto: 'h2', type: 'json', size: '18 KB', time: '320 ms' },
  { method: 'get', host: 'realtime.example.com', path: '/socket', secure: false, status: 'info2', code: '101', proto: 'ws', type: '—', size: '—', time: 'open' },
  { method: 'del', host: 'api.github.com', path: '/repos/acme/app/hooks/1', secure: true, status: 'ok', code: '204', proto: 'h2', type: '—', size: '0 B', time: '77 ms' },
  { method: 'get', host: 'api.internal.local', path: '/v2/report', secure: false, status: 'err', code: '500', proto: 'h2', type: 'json', size: '512 B', time: '1.2 s' },
];

export const INSPECTOR_TABS = [
  { id: 'headers', label: 'Headers' },
  { id: 'request', label: 'Request' },
  { id: 'response', label: 'Response' },
  { id: 'timing', label: 'Timing' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'tls', label: 'TLS' },
] as const;

export type InspectorTab = (typeof INSPECTOR_TABS)[number]['id'];
