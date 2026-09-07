import type { TrafficRequestDraft, TrafficScenarioResult } from '../../server/scenarios/interfaces.ts';

const CATALOG_WIDTH = 260;
const MINIMUM_DETAIL_WIDTH = 360;
const MINIMUM_WORKBENCH_WIDTH = 440;
const SPLITTER_WIDTH = 1;

export function clampPlaygroundDetailWidth(requestedWidth: number, pageWidth: number): number {
  const maximumWidth = Math.max(
    MINIMUM_DETAIL_WIDTH,
    pageWidth - CATALOG_WIDTH - MINIMUM_WORKBENCH_WIDTH - SPLITTER_WIDTH,
  );
  return Math.min(maximumWidth, Math.max(MINIMUM_DETAIL_WIDTH, requestedWidth));
}

export function createTrafficRequestDraftJson(draft: TrafficRequestDraft): string {
  return JSON.stringify(draft, null, 2);
}

export function parseTrafficRequestDraftJson(text: string): TrafficRequestDraft {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Request Draft must be valid JSON.');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Request Draft must be a JSON object.');
  }
  const kind = (value as Readonly<Record<string, unknown>>).kind;
  if (kind !== 'http' && kind !== 'websocket' && kind !== 'grpc' && kind !== 'tls') {
    throw new Error('Request Draft kind must be http, websocket, grpc, or tls.');
  }
  return value as TrafficRequestDraft;
}

export function protocolForTrafficRequestDraft(
  draft: TrafficRequestDraft,
): TrafficScenarioResult['protocol'] {
  if (draft.kind === 'http') return draft.protocol === 'h2' ? 'h2' : 'http/1.1';
  return draft.kind;
}