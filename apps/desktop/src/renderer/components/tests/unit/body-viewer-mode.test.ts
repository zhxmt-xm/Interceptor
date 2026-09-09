import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BodyViewer } from '../../BodyViewer/BodyViewer';
import { CodeViewer, type CodeViewerProps } from '../../CodeViewer/CodeViewer';

const fixture = vi.hoisted(() => ({ selected: null as { kind: string; mode: string } | null, stateIndex: 0 }));

vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>();
  const react = {
    ...original,
    useEffect: () => undefined,
    useMemo: (compute: () => unknown) => compute(),
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => [fixture.stateIndex++ === 0 ? fixture.selected : initial, vi.fn()],
  };
  return { ...react, default: react };
});
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
vi.mock('../../CodeViewer/CodeViewer', () => ({ CodeViewer: () => null }));
vi.mock('../../share/useClipboardCopy', () => ({ useClipboardCopy: () => vi.fn() }));

function findCodeViewer(node: ReactNode): ReactElement<CodeViewerProps> {
  const pending = Children.toArray(node);
  while (pending.length > 0) {
    const candidate = pending.shift();
    if (!isValidElement<{ children?: ReactNode }>(candidate)) continue;
    if (candidate.type === CodeViewer) return candidate as ReactElement<CodeViewerProps>;
    pending.push(...Children.toArray(candidate.props.children));
  }
  throw new Error('Missing code body viewer.');
}

beforeEach(() => {
  fixture.selected = null;
  fixture.stateIndex = 0;
});

describe('BodyViewer Code and Raw modes', () => {
  it.each([
    ['text/html', '<html><body><h1>Capture</h1></body></html>'],
    ['application/xml', '<capture><ready>true</ready></capture>'],
    ['text/css', 'body{color:red}'],
  ])('isolates formatted and raw editor models for %s even with identical input text', (mediaType, source) => {
    const bytes = new TextEncoder().encode(source);
    const code = findCodeViewer(BodyViewer({ bytes, mediaType }));
    fixture.selected = { kind: 'code', mode: 'raw' };
    fixture.stateIndex = 0;
    const raw = findCodeViewer(BodyViewer({ bytes, mediaType }));

    expect(code.props.value).toBe(source);
    expect(raw.props.value).toBe(source);
    expect(raw.key).not.toBe(code.key);
  });
});