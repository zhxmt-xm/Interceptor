import type { KeyboardEvent, RefObject } from 'react';
import type {
  AgentSessionSnapshot,
  AgentTranscriptItem,
  AgentTurnSnapshot,
  ToolExecutionResult,
} from '@interceptor/agent-runtime';

export type AgentTranscriptEntry =
  | { readonly kind: 'user'; readonly item: Extract<AgentTranscriptItem, { kind: 'user-message' }> }
  | {
      readonly kind: 'turn';
      readonly turn: AgentTurnSnapshot;
      readonly items: readonly AgentResponseTranscriptItem[];
    };

export type AgentResponseTranscriptItem = Exclude<AgentTranscriptItem, { kind: 'user-message' }>;

export type AgentTurnContentBlock =
  | {
      readonly kind: 'assistant';
      readonly item: Extract<AgentResponseTranscriptItem, { kind: 'assistant-message' }>;
    }
  | {
      readonly kind: 'tools';
      readonly calls: readonly Extract<AgentResponseTranscriptItem, { kind: 'tool-call' }>[];
      readonly results: readonly Extract<AgentResponseTranscriptItem, { kind: 'tool-result' }>[];
    };

type AgentToolCallItem = Extract<AgentResponseTranscriptItem, { kind: 'tool-call' }>;
type AgentToolResultItem = Extract<AgentResponseTranscriptItem, { kind: 'tool-result' }>;
interface MutableAgentToolBlock {
  kind: 'tools';
  calls: AgentToolCallItem[];
  results: AgentToolResultItem[];
}

export type AgentToolResultSummary =
  | { readonly kind: 'transferJob'; readonly jobId: string; readonly state: 'running' | 'completed' | 'failed' | 'cancelled'; readonly processed: number; readonly total: number; readonly warningCount: number }
  | { readonly kind: 'transferJobMissing' }
  | { readonly kind: 'diagnosticsSnapshot'; readonly count: number; readonly droppedCount: number }
  | { readonly kind: 'diagnosticsExport'; readonly jobId: string; readonly state: 'running' | 'completed' | 'failed' | 'cancelled' }
  | { readonly kind: 'exportCanceled' }
  | { readonly kind: 'collection'; readonly revision: number; readonly requestCount: number; readonly folderCount: number }
  | { readonly kind: 'collectionReplaced'; readonly revision: number }
  | { readonly kind: 'collectionImported'; readonly revision: number; readonly requestCount: number; readonly folderCount: number }
  | { readonly kind: 'collectionExport'; readonly exported: boolean }
  | { readonly kind: 'rulesImported'; readonly revision: number; readonly ruleCount: number; readonly folderCount: number }
  | { readonly kind: 'importCanceled' }
  | { readonly kind: 'rulesExport'; readonly exported: boolean }
  | { readonly kind: 'coreProcess'; readonly state: string; readonly pid: number | null }
  | { readonly kind: 'systemProxy'; readonly supported: boolean; readonly owned: boolean; readonly enabled: boolean }
  | { readonly kind: 'systemProxyRestore'; readonly restored: boolean; readonly reason?: string }
  | { readonly kind: 'certificateStatus'; readonly present: boolean; readonly trusted: boolean; readonly mitmEnabled: boolean }
  | { readonly kind: 'decryption'; readonly trusted: boolean; readonly mitmEnabled: boolean; readonly decrypting: boolean }
  | { readonly kind: 'tlsHosts'; readonly count: number }
  | { readonly kind: 'tlsPassthrough'; readonly revision: number; readonly count: number }
  | { readonly kind: 'appContainers'; readonly supported: boolean; readonly count: number; readonly exemptCount: number }
  | { readonly kind: 'discovery'; readonly count: number }
  | { readonly kind: 'proxy'; readonly recording: boolean; readonly address: string }
  | {
      readonly kind: 'storage';
      readonly exchangeCount: number;
      readonly bodyCount: number;
      readonly totalBytes: number;
    }
  | { readonly kind: 'exchanges'; readonly count: number }
  | {
      readonly kind: 'exchange';
      readonly method: string;
      readonly path: string;
      readonly status: string;
    }
  | {
      readonly kind: 'body';
      readonly bytesRead: number;
      readonly end: boolean;
      readonly opaque: false;
    }
  | {
      readonly kind: 'body';
      readonly mimeType: string;
      readonly opaque: true;
    }
  | {
      readonly kind: 'websocket';
      readonly count: number;
      readonly hasMore: boolean;
    }
  | {
      readonly kind: 'grpc';
      readonly count: number;
      readonly side: 'request' | 'response';
      readonly hasMore: boolean;
      readonly recognized: boolean;
    }
  | { readonly kind: 'not-grpc' }
  | {
      readonly kind: 'rules';
      readonly revision: number;
      readonly ruleCount: number;
      readonly enabledCount: number;
    }
  | { readonly kind: 'ruleHits'; readonly ruleCount: number; readonly totalHits: number }
  | { readonly kind: 'rulesApplied'; readonly revision: number }
  | { readonly kind: 'breakpointBatch'; readonly state: 'continued' | 'dropped'; readonly count: number }
  | { readonly kind: 'breakpoints'; readonly count: number; readonly enabled: boolean }
  | { readonly kind: 'breakpointConfig'; readonly enabled: boolean }
  | {
      readonly kind: 'breakpointResolution';
      readonly breakpointId: string;
      readonly state: 'continued' | 'edited' | 'dropped';
    }
  | {
      readonly kind: 'request';
      readonly ok: boolean;
      readonly method: string;
      readonly path: string;
      readonly status: number;
      readonly totalBytes: number;
    }
  | {
      readonly kind: 'probe';
      readonly ok: true;
      readonly protocol: string;
      readonly alpn: string;
      readonly certificateCount: number;
    }
  | { readonly kind: 'probe'; readonly ok: false; readonly error: string }
  | {
      readonly kind: 'diagnostics';
      readonly count: number;
      readonly hasMore: boolean;
      readonly droppedCount: number;
    }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'value'; readonly value: string };

/** Groups persisted items into user messages and one response block per Turn. */
export function buildAgentTranscriptEntries(
  session: AgentSessionSnapshot,
): readonly AgentTranscriptEntry[] {
  const turnById = new Map(session.turns.map((turn) => [turn.turnId, turn]));
  const renderedTurnIds = new Set<string>();
  const entries: AgentTranscriptEntry[] = [];
  for (const item of session.items) {
    if (item.kind === 'user-message') {
      entries.push({ kind: 'user', item });
      continue;
    }
    if (renderedTurnIds.has(item.turnId)) continue;
    const turn = turnById.get(item.turnId);
    if (turn === undefined) continue;
    renderedTurnIds.add(item.turnId);
    entries.push({
      kind: 'turn',
      turn,
      items: session.items.filter((candidate): candidate is AgentResponseTranscriptItem => (
        candidate.kind !== 'user-message' && candidate.turnId === item.turnId
      )),
    });
  }
  return entries;
}

/** Preserve visible assistant text between consecutive Tool activity segments. */
export function buildAgentTurnContentBlocks(
  items: readonly AgentResponseTranscriptItem[],
): readonly AgentTurnContentBlock[] {
  const blocks: Array<AgentTurnContentBlock | MutableAgentToolBlock> = [];
  let tools: MutableAgentToolBlock | null = null;
  for (const item of items) {
    if (item.kind === 'assistant-message') {
      if (item.content !== '' || item.reasoningContent !== '') {
        blocks.push({ kind: 'assistant', item });
        tools = null;
      }
      continue;
    }
    if (item.kind === 'tool-call') {
      if (tools === null) {
        tools = { kind: 'tools', calls: [], results: [] };
        blocks.push(tools);
      }
      tools.calls.push(item);
      continue;
    }
    if (tools !== null) tools.results.push(item);
  }
  return blocks;
}

/** Formats compact model-authored arguments without hiding structured values. */
export function formatAgentToolArguments(value: unknown): string | null {
  if (!isRecord(value)) return compactJson(value);
  const entries = Object.entries(value);
  if (entries.length === 0) return null;
  return entries.map(([key, item]) => `${key}: ${formatScalar(item)}`).join(' · ');
}

/** Extracts a concise summary from one already-redacted Tool result. */
export function summarizeAgentToolResult(
  name: string,
  result: ToolExecutionResult,
): AgentToolResultSummary {
  if (!result.ok) return { kind: 'error', message: result.error.message };
  if (name === 'composer_export_collection' && isRecord(result.value) && typeof result.value['exported'] === 'boolean') {
    return { kind: 'collectionExport', exported: result.value['exported'] };
  }
  if (name === 'composer_import_collection' && isRecord(result.value)) {
    const value = result.value;
    if (value['imported'] === false) return { kind: 'importCanceled' };
    if (value['imported'] === true && typeof value['revision'] === 'number'
      && typeof value['requestCount'] === 'number' && typeof value['folderCount'] === 'number') {
      return { kind: 'collectionImported', revision: value['revision'], requestCount: value['requestCount'], folderCount: value['folderCount'] };
    }
  }
  if (name === 'rules_export' && isRecord(result.value) && typeof result.value['exported'] === 'boolean') {
    return { kind: 'rulesExport', exported: result.value['exported'] };
  }
  if (name === 'rules_import' && isRecord(result.value)) {
    const value = result.value;
    if (value['imported'] === false) return { kind: 'importCanceled' };
    if (value['imported'] === true && typeof value['revision'] === 'number'
      && typeof value['ruleCount'] === 'number' && typeof value['folderCount'] === 'number') {
      return { kind: 'rulesImported', revision: value['revision'], ruleCount: value['ruleCount'], folderCount: value['folderCount'] };
    }
  }
  if (name.startsWith('settings_') && isRecord(result.value)) {
    const value = result.value;
    if (name === 'settings_get_core_process_status'
      && typeof value['state'] === 'string'
      && (typeof value['pid'] === 'number' || value['pid'] === null)) {
      return { kind: 'coreProcess', state: value['state'], pid: value['pid'] };
    }
    if ((name === 'settings_get_system_proxy_status' || name === 'settings_enable_system_proxy')
      && typeof value['supported'] === 'boolean'
      && typeof value['owned'] === 'boolean'
      && typeof value['enabled'] === 'boolean') {
      return { kind: 'systemProxy', supported: value['supported'], owned: value['owned'], enabled: value['enabled'] };
    }
    if (name === 'settings_restore_system_proxy' && typeof value['restored'] === 'boolean') {
      return {
        kind: 'systemProxyRestore', restored: value['restored'],
        ...(typeof value['reason'] === 'string' ? { reason: value['reason'] } : {}),
      };
    }
    if (name === 'settings_get_certificate_status'
      && typeof value['present'] === 'boolean'
      && typeof value['trusted'] === 'boolean'
      && typeof value['mitmEnabled'] === 'boolean') {
      return { kind: 'certificateStatus', present: value['present'], trusted: value['trusted'], mitmEnabled: value['mitmEnabled'] };
    }
    if ((name === 'settings_get_tls_insecure_hosts' || name === 'settings_replace_tls_insecure_hosts') && Array.isArray(value['hosts'])) {
      return { kind: 'tlsHosts', count: value['hosts'].length };
    }
    if (name === 'settings_get_tls_passthrough'
      && Array.isArray(value['hosts']) && typeof value['revision'] === 'number') {
      return { kind: 'tlsPassthrough', revision: value['revision'], count: value['hosts'].length };
    }
    if (name === 'settings_replace_tls_passthrough') {
      if (value['ok'] === false && typeof value['message'] === 'string') {
        return { kind: 'error', message: value['message'] };
      }
      const settings = value['settings'];
      if (value['ok'] === true && isRecord(settings)
        && typeof settings['revision'] === 'number' && Array.isArray(settings['hosts'])) {
        return { kind: 'tlsPassthrough', revision: settings['revision'], count: settings['hosts'].length };
      }
    }
    if ((name === 'settings_enable_https_decryption' || name === 'settings_disable_https_decryption')
      && typeof value['trusted'] === 'boolean' && typeof value['mitmEnabled'] === 'boolean'
      && typeof value['decrypting'] === 'boolean') {
      return { kind: 'decryption', trusted: value['trusted'], mitmEnabled: value['mitmEnabled'], decrypting: value['decrypting'] };
    }
    if (name === 'settings_list_app_containers'
      && typeof value['supported'] === 'boolean' && Array.isArray(value['containers'])) {
      return {
        kind: 'appContainers', supported: value['supported'], count: value['containers'].length,
        exemptCount: value['containers'].filter((container) => isRecord(container) && container['exempt'] === true).length,
      };
    }
  }
  if (name === 'discover_tools' && isRecord(result.value) && Array.isArray(result.value['matches'])) {
    return { kind: 'discovery', count: result.value['matches'].length };
  }
  if ((name === 'capture_get_proxy_status' || name === 'capture_start_recording' || name === 'capture_stop_recording')
    && isRecord(result.value)) {
    const host = typeof result.value['host'] === 'string' ? result.value['host'] : null;
    const port = typeof result.value['port'] === 'number' ? result.value['port'] : null;
    return {
      kind: 'proxy',
      recording: result.value['recording'] === true,
      address: host === null || port === null ? 'not listening' : `${host}:${port}`,
    };
  }
  if ((name === 'capture_get_storage_status' || name === 'capture_clear') && isRecord(result.value)) {
    const exchangeCount = result.value['exchangeCount'];
    const bodyCount = result.value['bodyCount'];
    const totalBytes = result.value['totalBytes'];
    if (typeof exchangeCount === 'number'
      && typeof bodyCount === 'number'
      && typeof totalBytes === 'number') {
      return { kind: 'storage', exchangeCount, bodyCount, totalBytes };
    }
  }
  if (name === 'capture_list_exchanges' && isRecord(result.value) && Array.isArray(result.value['items'])) {
    return { kind: 'exchanges', count: result.value['items'].length };
  }
  if (name === 'capture_get_exchange' && isRecord(result.value) && isRecord(result.value['detail'])) {
    const detail = result.value['detail'];
    const summary = isRecord(detail['summary']) ? detail['summary'] : {};
    return {
      kind: 'exchange',
      method: typeof summary['method'] === 'string' ? summary['method'] : 'HTTP',
      path: typeof summary['path'] === 'string' ? summary['path'] : '/',
      status: typeof summary['statusCode'] === 'number'
        ? String(summary['statusCode'])
        : 'pending',
    };
  }
  if (name === 'capture_get_exchange_body' && isRecord(result.value)) {
    if (result.value['opaque'] === true && typeof result.value['mimeType'] === 'string') {
      return { kind: 'body', mimeType: result.value['mimeType'], opaque: true };
    }
    const bytesRead = result.value['bytesRead'];
    const end = result.value['end'];
    if (typeof bytesRead === 'number' && typeof end === 'boolean') {
      return { kind: 'body', bytesRead, end, opaque: false };
    }
  }
  if (name === 'capture_list_websocket_messages'
    && isRecord(result.value)
    && Array.isArray(result.value['items'])
    && typeof result.value['hasMore'] === 'boolean') {
    return {
      kind: 'websocket',
      count: result.value['items'].length,
      hasMore: result.value['hasMore'],
    };
  }
  if (name === 'capture_list_grpc_messages'
    && isRecord(result.value)
    && Array.isArray(result.value['items'])
    && (result.value['side'] === 'request' || result.value['side'] === 'response')
    && typeof result.value['hasMore'] === 'boolean'
    && typeof result.value['recognized'] === 'boolean') {
    if (!result.value['recognized']) return { kind: 'not-grpc' };
    return {
      kind: 'grpc',
      count: result.value['items'].length,
      side: result.value['side'],
      hasMore: result.value['hasMore'],
      recognized: result.value['recognized'],
    };
  }
  if (name === 'rules_get_tree' && isRecord(result.value) && isRecord(result.value['ruleSet'])) {
    const ruleSet = result.value['ruleSet'];
    const revision = ruleSet['revision'];
    const counts = countRuleNodes(ruleSet['nodes']);
    if (typeof revision === 'number' && counts !== null) {
      return { kind: 'rules', revision, ...counts };
    }
  }
  if (name === 'composer_get_collection' && isRecord(result.value) && isRecord(result.value['collection'])) {
    const collection = result.value['collection'];
    const counts = countCollectionNodes(collection['nodes']);
    if (typeof collection['revision'] === 'number' && counts !== null) {
      return { kind: 'collection', revision: collection['revision'], ...counts };
    }
  }
  if (name === 'composer_replace_collection' && isRecord(result.value) && typeof result.value['revision'] === 'number') {
    return { kind: 'collectionReplaced', revision: result.value['revision'] };
  }
  if (name === 'rules_get_hits' && isRecord(result.value) && Array.isArray(result.value['counts'])) {
    let totalHits = 0;
    for (const count of result.value['counts']) {
      if (!isRecord(count) || typeof count['count'] !== 'number') {
        return { kind: 'value', value: compactJson(result.value) };
      }
      totalHits += count['count'];
    }
    return { kind: 'ruleHits', ruleCount: result.value['counts'].length, totalHits };
  }
  if (name === 'rules_replace_tree' && isRecord(result.value) && typeof result.value['revision'] === 'number') {
    return { kind: 'rulesApplied', revision: result.value['revision'] };
  }
  if (['breakpoints_continue_queue', 'breakpoints_drop_queue', 'breakpoints_continue_rule'].includes(name)
    && isRecord(result.value) && typeof result.value['resolvedCount'] === 'number') {
    return {
      kind: 'breakpointBatch',
      state: name === 'breakpoints_drop_queue' ? 'dropped' : 'continued',
      count: result.value['resolvedCount'],
    };
  }
  if (name === 'breakpoints_list'
    && isRecord(result.value)
    && Array.isArray(result.value['breakpoints'])
    && typeof result.value['enabled'] === 'boolean') {
    return {
      kind: 'breakpoints',
      count: result.value['breakpoints'].length,
      enabled: result.value['enabled'],
    };
  }
  if ([
    'breakpoints_enable_http',
    'breakpoints_disable_http',
    'breakpoints_enable_websocket',
    'breakpoints_disable_websocket',
  ].includes(name) && isRecord(result.value) && typeof result.value['enabled'] === 'boolean') {
    return { kind: 'breakpointConfig', enabled: result.value['enabled'] };
  }
  if ([
    'breakpoints_continue',
    'breakpoints_forward_edited',
    'breakpoints_drop',
  ].includes(name) && isRecord(result.value)) {
    const breakpointId = result.value['breakpointId'];
    const state = result.value['state'];
    if (typeof breakpointId === 'string'
      && (state === 'continued' || state === 'edited' || state === 'dropped')) {
      return { kind: 'breakpointResolution', breakpointId, state };
    }
  }
  if (name === 'composer_send_request' && isRecord(result.value)) {
    const method = result.value['method'];
    const url = result.value['url'];
    const status = result.value['status'];
    const totalBytes = result.value['totalBytes'];
    if (typeof method === 'string'
      && typeof url === 'string'
      && typeof status === 'number'
      && typeof totalBytes === 'number') {
      return {
        kind: 'request',
        ok: result.value['ok'] === true,
        method,
        path: requestPath(url),
        status,
        totalBytes,
      };
    }
  }
  if (name === 'composer_probe_connection' && isRecord(result.value)) {
    if (result.value['ok'] === false && typeof result.value['error'] === 'string') {
      return { kind: 'probe', ok: false, error: result.value['error'] };
    }
    const protocol = result.value['protocol'];
    const alpn = result.value['alpn'];
    const certificates = result.value['certificates'];
    if (result.value['ok'] === true
      && typeof protocol === 'string'
      && typeof alpn === 'string'
      && Array.isArray(certificates)) {
      return {
        kind: 'probe',
        ok: true,
        protocol,
        alpn,
        certificateCount: certificates.length,
      };
    }
  }
  if (['capture_get_transfer_job', 'capture_cancel_transfer_job', 'capture_export_body', 'capture_export_har', 'capture_import_har', 'capture_export_archive', 'capture_import_archive'].includes(name) && isRecord(result.value)) {
    if (['capture_import_har', 'capture_import_archive'].includes(name) && result.value['started'] === false) return { kind: 'importCanceled' };
    if (['capture_export_body', 'capture_export_har', 'capture_export_archive'].includes(name) && result.value['started'] === false) return { kind: 'exportCanceled' };
    const job = result.value['job'];
    if (job === null) return { kind: 'transferJobMissing' };
    if (isRecord(job) && typeof job['id'] === 'string'
      && typeof job['processed'] === 'number' && typeof job['total'] === 'number'
      && typeof job['warningCount'] === 'number') {
      const state = job['state'];
      if (state === 'running' || state === 'completed' || state === 'failed' || state === 'cancelled') {
        return { kind: 'transferJob', jobId: job['id'], state, processed: job['processed'], total: job['total'], warningCount: job['warningCount'] };
      }
    }
  }
  if (['diagnostics_get_trace', 'diagnostics_get_recent'].includes(name)
    && isRecord(result.value) && Array.isArray(result.value['records'])
    && typeof result.value['droppedCount'] === 'number') {
    return { kind: 'diagnosticsSnapshot', count: result.value['records'].length, droppedCount: result.value['droppedCount'] };
  }
  if (name === 'diagnostics_export' && isRecord(result.value)) {
    if (result.value['started'] === false) return { kind: 'exportCanceled' };
    const job = result.value['job'];
    if (result.value['started'] === true && isRecord(job) && typeof job['id'] === 'string') {
      const state = job['state'];
      if (state === 'running' || state === 'completed' || state === 'failed' || state === 'cancelled') {
        return { kind: 'diagnosticsExport', jobId: job['id'], state };
      }
    }
  }
  if (name === 'diagnostics_query'
    && isRecord(result.value)
    && Array.isArray(result.value['records'])
    && typeof result.value['hasMore'] === 'boolean'
    && typeof result.value['droppedCount'] === 'number') {
    return {
      kind: 'diagnostics',
      count: result.value['records'].length,
      hasMore: result.value['hasMore'],
      droppedCount: result.value['droppedCount'],
    };
  }
  return { kind: 'value', value: compactJson(result.value) };
}

/** Return only the redacted path and query from one Tool result URL. */
function requestPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/** Counts trusted Rule leaves without assuming one concrete tree depth. */
function countCollectionNodes(value: unknown): { requestCount: number; folderCount: number } | null {
  if (!Array.isArray(value)) return null;
  let requestCount = 0;
  let folderCount = 0;
  for (const node of value) {
    if (!isRecord(node)) return null;
    if (node['kind'] === 'request') {
      requestCount += 1;
    } else if (node['kind'] === 'folder') {
      const children = countCollectionNodes(node['children']);
      if (children === null) return null;
      folderCount += 1 + children.folderCount;
      requestCount += children.requestCount;
    } else {
      return null;
    }
  }
  return { requestCount, folderCount };
}

function countRuleNodes(
  value: unknown,
): { readonly ruleCount: number; readonly enabledCount: number } | null {
  if (!Array.isArray(value)) return null;
  let ruleCount = 0;
  let enabledCount = 0;
  const visit = (node: unknown): boolean => {
    if (!isRecord(node)) return false;
    if (node['kind'] === 'rule' && typeof node['enabled'] === 'boolean') {
      ruleCount += 1;
      if (node['enabled']) enabledCount += 1;
      return true;
    }
    if (node['kind'] !== 'folder' || !Array.isArray(node['children'])) return false;
    return node['children'].every(visit);
  };
  return value.every(visit) ? { ruleCount, enabledCount } : null;
}

/** Returns whether an unknown value is a non-array record. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Formats one compact argument value. */
function formatScalar(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : compactJson(value);
}

/** Bounds structured fallback summaries so one row remains scannable. */
function compactJson(value: unknown): string {
  const serialized = JSON.stringify(value) ?? String(value);
  return serialized.length <= 160 ? serialized : `${serialized.slice(0, 157)}...`;
}

/** Format token counts compactly without hiding exact values from data attributes. */
export function compactTokenCount(value: number): string {
  if (value >= 1_000_000) {
    return `${Math.round(value / 100_000) / 10}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 100) / 10}k`;
  }
  return String(value);
}

/** Navigate an Agent listbox and restore its trigger when Escape closes it. */
export function navigateAgentListbox(
  event: KeyboardEvent<HTMLElement>,
  close: () => void,
  triggerRef: RefObject<HTMLButtonElement | null>,
): void {
  const options = [...event.currentTarget.querySelectorAll<HTMLElement>(
    '[role="option"]:not([disabled])',
  )];
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    requestAnimationFrame(() => triggerRef.current?.focus());
    return;
  }
  if (options.length === 0) return;
  const currentIndex = Math.max(0, options.indexOf(document.activeElement as HTMLElement));
  let nextIndex: number | undefined;
  if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % options.length;
  if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + options.length) % options.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = options.length - 1;
  if (nextIndex === undefined) return;
  event.preventDefault();
  options[nextIndex]?.focus();
}
