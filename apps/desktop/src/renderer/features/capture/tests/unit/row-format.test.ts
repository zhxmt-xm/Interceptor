import { Children, createElement, isValidElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IconButton } from '../../../../components/IconButton/IconButton';
import type { KvRow } from '../../interfaces';
import { Kv } from '../../RequestInspector/Kv';

import {
  headersWithoutCookies,
  headersWithRuleEffects,
  payloadClipboardText,
  requestCookiePairs,
  responseCookiePairs,
  responseTimingSegments,
  splitKvTextLines,
  typeLabel,
} from '../../utils';

const fixture = vi.hoisted(() => ({ copy: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../../components', async () => {
  const { IconButton } = await import('../../../../components/IconButton/IconButton');
  const { cx } = await import('../../../../components/share/cx');
  return { IconButton, cx, useClipboardCopy: () => fixture.copy };
});
afterEach(() => vi.clearAllMocks());

function valueItems(row: KvRow, onOpenRule?: (ruleId: string) => void): ReactNode[] {
  const element = Kv({ rows: [row], onOpenRule });
  const renderedRow = Children.toArray(element.props.children)[0];
  if (!isValidElement<{ children: ReactNode }>(renderedRow)) throw new Error('Expected one Kv row.');
  const value = Children.toArray(renderedRow.props.children)[1];
  if (!isValidElement<{ value: ReactNode; children: ReactNode }>(value)) throw new Error('Expected a Kv value container.');
  return [value.props.value, ...Children.toArray(value.props.children)];
}

describe('capture row format', () => {
  it('normalizes native gRPC content types to a compact label', () => {
    expect(typeLabel('application/grpc')).toBe('grpc');
    expect(typeLabel('application/grpc+proto')).toBe('grpc');
    expect(typeLabel('application/grpc+json; charset=utf-8')).toBe('grpc');
    expect(typeLabel('application/grpc-web+proto')).toBe('grpc-web');
  });

  it('keeps Cookie and Set-Cookie exclusively in the Cookies tab', () => {
    const headers = [
      { name: ':method', value: 'GET', isPseudo: true },
      { name: 'Cookie', value: 'session=one' },
      { name: 'content-type', value: 'application/json' },
      { name: 'SET-COOKIE', value: 'session=two; HttpOnly' },
    ];

    expect(headersWithoutCookies(headers)).toEqual([
      { name: ':method', value: 'GET', isPseudo: true },
      { name: 'content-type', value: 'application/json' },
    ]);
  });

  it('deduplicates request/response wire headers against exact rule effects', () => {
    expect(headersWithRuleEffects([
      { name: 'x-old', value: 'before' },
      { name: 'x-old', value: 'before', ruleEffect: 'replace' },
      { name: 'x-old', value: 'after', ruleEffect: 'set' },
    ], 'request')).toEqual([
      { name: 'x-old', value: 'before', ruleEffect: 'replace' },
      { name: 'x-old', value: 'after', ruleEffect: 'set' },
    ]);
    expect(headersWithRuleEffects([
      { name: 'x-old', value: 'after' },
      { name: 'x-old', value: 'before', ruleEffect: 'replace' },
      { name: 'x-old', value: 'after', ruleEffect: 'set' },
    ], 'response')).toEqual([
      { name: 'x-old', value: 'before', ruleEffect: 'replace' },
      { name: 'x-old', value: 'after', ruleEffect: 'set' },
    ]);
  });

  it('parses every HTTP/2 Cookie header row', () => {
    expect(requestCookiePairs([
      { name: 'cookie', value: 'theme=dark' },
      { name: 'Cookie', value: 'session=abc=123' },
      { name: 'cookie', value: 'one=1; two=2' },
    ])).toEqual([
      ['theme', 'dark'],
      ['session', 'abc=123'],
      ['one', '1'],
      ['two', '2'],
    ]);
  });

  it('keeps each Set-Cookie header intact', () => {
    expect(responseCookiePairs([
      { name: 'set-cookie', value: 'session=abc; Path=/; HttpOnly' },
      { name: 'Set-Cookie', value: 'theme=dark; SameSite=Lax' },
    ])).toEqual([
      ['session', 'session=abc; Path=/; HttpOnly'],
      ['theme', 'theme=dark; SameSite=Lax'],
    ]);
  });

  it('builds honest waiting and response-body timing segments', () => {
    expect(responseTimingSegments(1_000, 1_480, 1_600)).toEqual([
      { id: 'waiting', durationMs: 480, offsetPercent: 0, widthPercent: 80 },
      { id: 'download', durationMs: 120, offsetPercent: 80, widthPercent: 20 },
    ]);
    expect(responseTimingSegments(1_000, undefined, 1_600)).toEqual([]);
  });
});

describe('payload clipboard text', () => {
  it('omits only an unfinished UTF-8 suffix in a limited text preview', () => {
    const bytes = new Uint8Array([0x61, 0xff, 0x62, 0xe4, 0xbd]);

    expect(payloadClipboardText(bytes, true, true)).toBe('a\ufffdb');
    expect(payloadClipboardText(bytes, true)).toBe('a\ufffdb\ufffd');
    expect(payloadClipboardText(bytes, true, false)).toBe('a\ufffdb\ufffd');
  });

  it('keeps every byte when copying binary payloads regardless of the preview limit', () => {
    const bytes = new Uint8Array([0x61, 0xff, 0x62, 0xe4, 0xbd]);
    const expected = '61 ff 62 e4 bd';

    expect(payloadClipboardText(bytes, false, true)).toBe(expected);
    expect(payloadClipboardText(bytes, false, false)).toBe(expected);
  });
});

describe('Kv value actions', () => {
  it('keeps complete graphemes and whitespace when grouping measured lines', () => {
    const lines = ['private, ', '\ud83d\ude42e\u0301 ', 'max-age=60'] as const;
    const value = lines.join('');
    expect(splitKvTextLines(value, (offset) => offset < lines[0].length ? 0
      : offset < lines[0].length + lines[1].length ? 18 : 36)).toEqual(lines);
    expect(splitKvTextLines('', () => { throw new Error('Empty text must not be measured.'); })).toEqual(['']);
  });

  it('finds line boundaries without measuring every character of a long value', () => {
    const value = 'header-value;'.repeat(200);
    const lineTop = vi.fn((offset: number) => Math.floor(offset / 100) * 18);
    const lines = splitKvTextLines(value, lineTop);
    expect(lines.join('')).toBe(value);
    expect(lines).toHaveLength(26);
    expect(lines.every((line) => line.length === 100)).toBe(true);
    expect(lineTop.mock.calls.length).toBeLessThan(400);
  });

  it.each(['set', 'replace', 'remove'] as const)('passes the complete %s value to the last-line layout', (effect) => {
    const fullValue = `max-age=0, ${'cache-control-value;'.repeat(30)}`;
    const element = Kv({ rows: [['cache-control', fullValue, 'a', undefined, effect]] });
    const row = Children.toArray(element.props.children)[0];
    if (!isValidElement<{ children: ReactNode }>(row)) throw new Error('Expected one Kv row.');
    const value = Children.toArray(row.props.children)[1];
    if (!isValidElement(value)) throw new Error('Expected the value layout.');

    expect(value.props).toMatchObject({
      value: fullValue,
      accent: 'a',
      inactive: effect === 'replace' || effect === 'remove',
    });
  });

  it.each(['set', 'append', 'replace', 'remove'] as const)('keeps text, %s marker and Copy in order without changing the full value', (effect) => {
    const fullValue = `max-age=0, ${'cache-control-value;'.repeat(30)}`;
    const onOpenRule = vi.fn();
    const items = valueItems(['cache-control', fullValue, undefined, undefined, effect, 'rule-headers'], onOpenRule);
    expect(items).toHaveLength(3);
    const [text, marker, copy] = items;
    expect(text).toBe(fullValue);
    expect(isValidElement(marker) && marker.type).toBe('button');
    expect(isValidElement(copy) && copy.type).toBe(IconButton);
    if (!isValidElement<{ onClick(): void; 'data-effect': string }>(marker)
      || !isValidElement<{ onClick(): void; size: string }>(copy)) throw new Error('Missing value actions.');
    expect(copy.props.size).toBe('inline');
    expect(marker.props['data-effect']).toBe(effect);
    marker.props.onClick();
    expect(onOpenRule).toHaveBeenCalledWith('rule-headers');
    copy.props.onClick();
    expect(fixture.copy).toHaveBeenCalledWith(fullValue);
  });

  it('copies the explicit full value when the displayed value is a component', () => {
    const displayValue = createElement('span', null, '200 OK');
    const items = valueItems(['Status', displayValue, undefined, '200']);
    const copy = items[1];
    expect(isValidElement(copy) && copy.type).toBe(IconButton);
    if (!isValidElement<{ onClick(): void; size: string }>(copy)) throw new Error('Missing Copy action.');
    expect(copy.props.size).toBe('inline');
    copy.props.onClick();
    expect(fixture.copy).toHaveBeenCalledWith('200');
  });

  it('keeps a noninteractive marker when no rule navigation is available', () => {
    const items = valueItems(['x-test', 'value', undefined, undefined, 'append']);
    const marker = items[1];
    expect(isValidElement(marker) && marker.type).toBe('span');
    if (!isValidElement<{ onClick?: () => void }>(marker)) throw new Error('Missing effect marker.');
    expect(marker.props.onClick).toBeUndefined();
  });
});