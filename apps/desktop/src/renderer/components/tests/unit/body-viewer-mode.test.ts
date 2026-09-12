import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { FileVideo2 } from 'lucide-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BodyViewer } from '../../BodyViewer/BodyViewer';
import { BodyToolbar } from '../../BodyViewer/BodyToolbar/BodyToolbar';
import { HexView } from '../../BodyViewer/HexView/HexView';
import { UnavailableBody } from '../../BodyViewer/UnavailableBody/UnavailableBody';
import { toHexDump } from '../../BodyViewer/bodyText';
import { Button } from '../../Button/Button';
import { CodeViewer, type CodeViewerProps } from '../../CodeViewer/CodeViewer';

const fixture = vi.hoisted(() => ({ selected: null as { kind: string; mode: string } | null, stateIndex: 0, copy: vi.fn() }));

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
vi.mock('../../share/useClipboardCopy', () => ({ useClipboardCopy: () => fixture.copy }));

function findBodyComponent<Props>(node: ReactNode, component: unknown): ReactElement<Props> {
  const pending = Children.toArray(node);
  while (pending.length > 0) {
    const candidate = pending.shift();
    if (!isValidElement<{ children?: ReactNode }>(candidate)) continue;
    if (candidate.type === component) return candidate as ReactElement<Props>;
    pending.push(...Children.toArray(candidate.props.children));
  }
  throw new Error('Missing body component.');
}

beforeEach(() => {
  fixture.selected = null;
  fixture.stateIndex = 0;
  fixture.copy.mockClear();
});

describe('BodyViewer Code and Raw modes', () => {
  it.each([
    ['text/html', '<html><body><h1>Capture</h1></body></html>'],
    ['application/xml', '<capture><ready>true</ready></capture>'],
    ['text/css', 'body{color:red}'],
  ])('isolates formatted and raw editor models for %s even with identical input text', (mediaType, source) => {
    const bytes = new TextEncoder().encode(source);
    const code = findBodyComponent<CodeViewerProps>(BodyViewer({ bytes, mediaType }), CodeViewer);
    fixture.selected = { kind: 'code', mode: 'raw' };
    fixture.stateIndex = 0;
    const raw = findBodyComponent<CodeViewerProps>(BodyViewer({ bytes, mediaType }), CodeViewer);

    expect(code.props.value).toBe(source);
    expect(raw.props.value).toBe(source);
    expect(raw.key).not.toBe(code.key);
  });

  it.each([true, false])('uses the explicit preview truncation flag (%s) for both text and Copy', (previewTruncated) => {
    const bytes = new Uint8Array([0x61, 0xe4, 0xbd]);
    const body = BodyViewer({ bytes, mediaType: 'text/plain', previewTruncated });
    const code = findBodyComponent<CodeViewerProps>(body, CodeViewer);
    const toolbar = findBodyComponent<ComponentProps<typeof BodyToolbar>>(body, BodyToolbar);
    const expected = previewTruncated ? 'a' : 'a\ufffd';

    expect(code.props.value).toBe(expected);
    toolbar.props.onCopy!();
    expect(fixture.copy).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it('retains every preview byte in Hex display and Copy', () => {
    const bytes = new Uint8Array([0x61, 0xe4, 0xbd]);
    fixture.selected = { kind: 'text', mode: 'hex' };
    const body = BodyViewer({ bytes, mediaType: 'text/plain', previewTruncated: true });
    const hex = findBodyComponent<ComponentProps<typeof HexView>>(body, HexView);
    const toolbar = findBodyComponent<ComponentProps<typeof BodyToolbar>>(body, BodyToolbar);

    expect(hex.props.bytes).toBe(bytes);
    toolbar.props.onCopy!();
    expect(fixture.copy).toHaveBeenCalledExactlyOnceWith(toHexDump(bytes));
  });

  it('keeps an untyped limited UTF-8 body in Text mode instead of misclassifying the cutoff as binary', () => {
    const bytes = new Uint8Array([0x61, 0xe4, 0xbd]);
    const body = BodyViewer({ bytes, mediaType: undefined, previewTruncated: true });
    const code = findBodyComponent<CodeViewerProps>(body, CodeViewer);

    expect(code.props.value).toBe('a');
  });
});

describe('Unavailable media body controls', () => {
  it.each([false, true])('preserves the small Save action and loading state (%s)', (saving) => {
    const saveBody = vi.fn();
    const body = UnavailableBody({
      icon: FileVideo2,
      mediaType: 'video/mp4',
      measures: '24 MB',
      reason: 'Media is saved without starting a player.',
      saving,
      onSave: saveBody,
    });
    const action = findBodyComponent<ComponentProps<typeof Button>>(body, Button);

    expect(action.props.size).toBe('sm');
    expect(action.props.loading).toBe(saving);
    expect(action.props.children).toBe('body.save');
    action.props.onClick?.();
    expect(saveBody).toHaveBeenCalledOnce();
  });
});