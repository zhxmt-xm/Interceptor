import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { FileVideo2 } from 'lucide-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BodyViewer, type BodyViewerProps } from '../../BodyViewer/BodyViewer';
import { BodyToolbar } from '../../BodyViewer/BodyToolbar/BodyToolbar';
import { HexView } from '../../BodyViewer/HexView/HexView';
import { JsonTreeView } from '../../BodyViewer/JsonTreeView/JsonTreeView';
import { UnavailableBody } from '../../BodyViewer/UnavailableBody/UnavailableBody';
import { toHexDump } from '../../BodyViewer/bodyText';
import { Button } from '../../Button/Button';
import { CodeViewer, type CodeViewerProps } from '../../CodeViewer/CodeViewer';

const fixture = vi.hoisted(() => ({ selected: null as { kind: string; mode: string } | null, fullscreen: false, stateIndex: 0, copy: vi.fn() }));

vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>();
  const react = {
    ...original,
    useEffect: () => undefined,
    useMemo: (compute: () => unknown) => compute(),
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => {
      const stateIndex = fixture.stateIndex++;
      return [stateIndex === 0 ? fixture.selected : stateIndex === 4 ? fixture.fullscreen : initial, vi.fn()];
    },
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
  fixture.fullscreen = false;
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

describe('Compact JSON tree layout', () => {
  it.each([
    { compact: false, fullscreen: false, treeCompact: false },
    { compact: true, fullscreen: false, treeCompact: true },
    { compact: true, fullscreen: true, treeCompact: false },
  ])('uses content sizing only for inline compact messages: %j', ({ compact, fullscreen, treeCompact }) => {
    const source = '{"buildId":8431,"state":"running","branch":"main"}';
    fixture.selected = { kind: 'json', mode: 'tree' };
    fixture.fullscreen = fullscreen;
    const body = BodyViewer({ bytes: new TextEncoder().encode(source), mediaType: 'application/json',
      compact, fullscreenTitle: 'Payload' });
    const tree = findBodyComponent<ComponentProps<typeof JsonTreeView>>(body, JsonTreeView);

    expect(tree.props).toMatchObject({ root: JSON.parse(source), compact: treeCompact });
    if (!fullscreen) {
      const toolbar = findBodyComponent<ComponentProps<typeof BodyToolbar>>(body, BodyToolbar);
      toolbar.props.onCopy!();
      expect(fixture.copy).toHaveBeenCalledExactlyOnceWith(source);
    }
  });
});

describe('Resizable ordinary message layout', () => {
  it.each([
    { compact: true, fullscreen: false, resizable: true, expected: true },
    { compact: true, fullscreen: true, resizable: true, expected: false },
    { compact: false, fullscreen: false, resizable: true, expected: false },
    { compact: true, fullscreen: false, resizable: false, expected: false },
  ])('only resizes an opted-in inline Monaco message: %j', ({ compact, fullscreen, resizable, expected }) => {
    fixture.fullscreen = fullscreen;
    const source = '{"buildId":8431,"state":"running","branch":"main"}';
    const props: BodyViewerProps = {
      bytes: new TextEncoder().encode(source), mediaType: 'application/json',
      fullscreenTitle: 'Payload', compact, resizable,
    };
    const body = BodyViewer(props);
    const code = findBodyComponent<CodeViewerProps>(body, CodeViewer);
    expect(code.props.resizable).toBe(expected);
    expect(code.props.value).toBe(JSON.stringify(JSON.parse(source), null, 2));
  });
});

describe('Readonly body format budgets', () => {
  it.each([
    { size: 1024 * 1024, formatState: 'hidden', automatic: true },
    { size: 1024 * 1024 + 1, formatState: 'idle', automatic: false },
    { size: 2 * 1024 * 1024, formatState: 'idle', automatic: false },
    { size: 2 * 1024 * 1024 + 1, formatState: 'blocked', automatic: false },
  ] as const)('uses exact UTF-8 boundaries at $size bytes', ({ size, formatState, automatic }) => {
    const source = `{"data":"${'a'.repeat(size - 11)}"}`;
    const bytes = new TextEncoder().encode(source);
    expect(bytes.byteLength).toBe(size);
    const body = BodyViewer({ bytes, mediaType: 'application/json' });
    const viewer = findBodyComponent<CodeViewerProps>(body, CodeViewer);
    const toolbar = findBodyComponent<ComponentProps<typeof BodyToolbar>>(body, BodyToolbar);
    expect(toolbar.props.formatState).toBe(formatState);
    expect(viewer.props.value === (automatic ? JSON.stringify(JSON.parse(source), null, 2) : source.slice(0, 2 * 1024 * 1024))).toBe(true);
  });
  it('blocks incomplete captured documents without hiding their actual broken UTF-8 suffix', () => {
    const props: BodyViewerProps = {
      bytes: new Uint8Array([0x3c, 0x70, 0x3e, 0xe4, 0xbd]),
      mediaType: 'text/html', incomplete: true,
    };
    const body = BodyViewer(props);
    expect(findBodyComponent<ComponentProps<typeof BodyToolbar>>(body, BodyToolbar).props.formatState).toBe('blocked');
    expect(findBodyComponent<CodeViewerProps>(body, CodeViewer).props.value).toBe('<p>\ufffd');
  });
  it('does not pass an oversized image prefix to the image decoder', () => {
    const body = BodyViewer({
      bytes: new Uint8Array(16 * 1024 * 1024 + 1),
      mediaType: 'image/png',
    });
    expect(findBodyComponent<ComponentProps<typeof UnavailableBody>>(body, UnavailableBody).props.reason)
      .toBe('body.imageTooLarge');
  });
  it('keeps complete JSON above 1 MiB unformatted until Format is requested', () => {
    const source = JSON.stringify({ text: 'x'.repeat(1024 * 1024) });
    const body = BodyViewer({ bytes: new TextEncoder().encode(source), mediaType: 'application/json' });
    const viewer = findBodyComponent<CodeViewerProps>(body, CodeViewer);
    const toolbar = findBodyComponent<ComponentProps<typeof BodyToolbar>>(body, BodyToolbar);
    expect(viewer.props.value === source).toBe(true);
    expect(toolbar.props.formatState).toBe('idle');
  });

  it.each(['application/json', 'text/html'])('blocks formatting on an explicitly truncated %s preview', (mediaType) => {
    const source = mediaType === 'application/json' ? '{"ok":true}' : '<html><p>partial</p></html>';
    const body = BodyViewer({ bytes: new TextEncoder().encode(source), mediaType, previewTruncated: true });
    const toolbar = findBodyComponent<ComponentProps<typeof BodyToolbar>>(body, BodyToolbar);
    const viewer = findBodyComponent<CodeViewerProps>(body, CodeViewer);
    expect(toolbar.props.formatState).toBe('blocked');
    expect(viewer.props.value).toBe(source);
  });

  it('blocks formatting complete code above 2 MiB without changing its source', () => {
    const source = '<html>' + 'x'.repeat(2 * 1024 * 1024) + '</html>';
    const body = BodyViewer({ bytes: new TextEncoder().encode(source), mediaType: 'text/html' });
    const toolbar = findBodyComponent<ComponentProps<typeof BodyToolbar>>(body, BodyToolbar);
    expect(toolbar.props.formatState).toBe('blocked');
    expect(findBodyComponent<CodeViewerProps>(body, CodeViewer).props.value === source.slice(0, 2 * 1024 * 1024)).toBe(true);
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