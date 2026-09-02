import { describe, expect, it } from 'vitest';

import {
  clampPlaygroundDetailWidth,
  createTrafficRequestDraftJson,
  parseTrafficRequestDraftJson,
  protocolForTrafficRequestDraft,
} from '../../src/capture-workspace';

describe('Capture workspace', () => {
  it('clamps Response Detail from the live page width', () => {
    expect(clampPlaygroundDetailWidth(900, 1_380)).toBe(679);
    expect(clampPlaygroundDetailWidth(100, 1_380)).toBe(360);
    expect(clampPlaygroundDetailWidth(560, 1_261)).toBe(560);
  });

  it('round trips a protocol-specific draft through the Raw JSON editor', () => {
    const draft = {
      clientMessages: [{ data: 'hello', encoding: 'utf8' as const }],
      controls: ['ping', 'close'] as const,
      headers: { 'x-playground': 'edited' },
      kind: 'websocket' as const,
      path: '/playground/ws/edited',
      serverMessages: [],
    };

    expect(parseTrafficRequestDraftJson(createTrafficRequestDraftJson(draft))).toEqual(draft);
    expect(() => parseTrafficRequestDraftJson('{ invalid')).toThrow('Request Draft must be valid JSON.');
  });

  it('derives the visible protocol from the edited Draft transport', () => {
    expect(protocolForTrafficRequestDraft({
      body: '',
      headers: {},
      kind: 'http',
      method: 'GET',
      path: '/',
      protocol: 'h2',
    })).toBe('h2');
    expect(protocolForTrafficRequestDraft({
      clientMessages: [],
      controls: [],
      headers: {},
      kind: 'websocket',
      path: '/ws',
      serverMessages: [],
    })).toBe('websocket');
  });
});