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
  | { readonly kind: 'breakpoints'; readonly count: number; readonly enabled: boolean }
  | { readonly kind: 'breakpointConfig'; readonly enabled: boolean }
  | {
      readonly kind: 'breakpointResolution';
      readonly breakpointId: string;
      readonly state: 'continued' | 'edited' | 'dropped';
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
  if (name === 'discover_tools' && isRecord(result.value) && Array.isArray(result.value['matches'])) {
    return { kind: 'discovery', count: result.value['matches'].length };
  }
  if ((name === 'get_proxy_status' || name === 'start_recording' || name === 'stop_recording')
    && isRecord(result.value)) {
    const host = typeof result.value['host'] === 'string' ? result.value['host'] : null;
    const port = typeof result.value['port'] === 'number' ? result.value['port'] : null;
    return {
      kind: 'proxy',
      recording: result.value['recording'] === true,
      address: host === null || port === null ? 'not listening' : `${host}:${port}`,
    };
  }
  if ((name === 'get_storage_status' || name === 'clear_capture') && isRecord(result.value)) {
    const exchangeCount = result.value['exchangeCount'];
    const bodyCount = result.value['bodyCount'];
    const totalBytes = result.value['totalBytes'];
    if (typeof exchangeCount === 'number'
      && typeof bodyCount === 'number'
      && typeof totalBytes === 'number') {
      return { kind: 'storage', exchangeCount, bodyCount, totalBytes };
    }
  }
  if (name === 'list_exchanges' && isRecord(result.value) && Array.isArray(result.value['items'])) {
    return { kind: 'exchanges', count: result.value['items'].length };
  }
  if (name === 'get_exchange' && isRecord(result.value) && isRecord(result.value['detail'])) {
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
  if (name === 'get_exchange_body' && isRecord(result.value)) {
    if (result.value['opaque'] === true && typeof result.value['mimeType'] === 'string') {
      return { kind: 'body', mimeType: result.value['mimeType'], opaque: true };
    }
    const bytesRead = result.value['bytesRead'];
    const end = result.value['end'];
    if (typeof bytesRead === 'number' && typeof end === 'boolean') {
      return { kind: 'body', bytesRead, end, opaque: false };
    }
  }
  if (name === 'list_websocket_messages'
    && isRecord(result.value)
    && Array.isArray(result.value['items'])
    && typeof result.value['hasMore'] === 'boolean') {
    return {
      kind: 'websocket',
      count: result.value['items'].length,
      hasMore: result.value['hasMore'],
    };
  }
  if (name === 'list_grpc_messages'
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
  if (name === 'get_rules' && isRecord(result.value) && isRecord(result.value['ruleSet'])) {
    const ruleSet = result.value['ruleSet'];
    const revision = ruleSet['revision'];
    const counts = countRuleNodes(ruleSet['nodes']);
    if (typeof revision === 'number' && counts !== null) {
      return { kind: 'rules', revision, ...counts };
    }
  }
  if (name === 'get_rule_hits' && isRecord(result.value) && Array.isArray(result.value['counts'])) {
    let totalHits = 0;
    for (const count of result.value['counts']) {
      if (!isRecord(count) || typeof count['count'] !== 'number') {
        return { kind: 'value', value: compactJson(result.value) };
      }
      totalHits += count['count'];
    }
    return { kind: 'ruleHits', ruleCount: result.value['counts'].length, totalHits };
  }
  if (name === 'apply_rules' && isRecord(result.value) && typeof result.value['revision'] === 'number') {
    return { kind: 'rulesApplied', revision: result.value['revision'] };
  }
  if (name === 'list_breakpoints'
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
    'enable_http_breakpoints',
    'disable_http_breakpoints',
    'enable_websocket_breakpoint',
    'disable_websocket_breakpoint',
  ].includes(name) && isRecord(result.value) && typeof result.value['enabled'] === 'boolean') {
    return { kind: 'breakpointConfig', enabled: result.value['enabled'] };
  }
  if ([
    'continue_breakpoint',
    'forward_edited_breakpoint',
    'drop_breakpoint',
  ].includes(name) && isRecord(result.value)) {
    const breakpointId = result.value['breakpointId'];
    const state = result.value['state'];
    if (typeof breakpointId === 'string'
      && (state === 'continued' || state === 'edited' || state === 'dropped')) {
      return { kind: 'breakpointResolution', breakpointId, state };
    }
  }
  return { kind: 'value', value: compactJson(result.value) };
}

/** Counts trusted Rule leaves without assuming one concrete tree depth. */
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
