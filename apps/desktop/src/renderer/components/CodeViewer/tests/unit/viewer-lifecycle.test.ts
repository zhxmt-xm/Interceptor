import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CodeViewer, type CodeViewerProps } from '../../CodeViewer';

const fixture = vi.hoisted(() => {
  const model = { dispose: vi.fn() };
  const sizeSubscription = { dispose: vi.fn() };
  const editor = {
    getModel: vi.fn(() => model),
    getContentHeight: vi.fn(() => 86),
    layout: vi.fn(),
    onDidContentSizeChange: vi.fn((_listener: () => void) => sizeSubscription),
    dispose: vi.fn(() => {
      if (model.dispose.mock.calls.length > 0) throw new Error('Model was disposed while attached.');
      model.dispose();
    }),
  };
  return { editor, model, sizeSubscription, references: [] as { current: unknown }[], effects: [] as (() => void | (() => void))[] };
});

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useRef: (initial: unknown) => {
    const reference = { current: initial };
    fixture.references.push(reference);
    return reference;
  },
  useEffect: (effect: () => void | (() => void)) => { fixture.effects.push(effect); },
  useImperativeHandle: () => undefined,
}));
vi.mock('../../monacoSetup', () => ({
  monaco: { editor: { create: () => fixture.editor } }, VIEWER_OPTIONS: {}, formatMonacoModel: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  fixture.references.length = 0;
  fixture.effects.length = 0;
  fixture.editor.getContentHeight.mockReturnValue(86);
});

afterEach(() => vi.unstubAllGlobals());

describe('Compact CodeViewer content height', () => {
  it.each([1, 2 / 3])('adds only the actual %s px top and bottom borders', (borderWidth) => {
    vi.stubGlobal('getComputedStyle', vi.fn(() => ({ borderTopWidth: String(borderWidth), borderBottomWidth: String(borderWidth) })));
    const component = CodeViewer as unknown as { render(props: CodeViewerProps, ref: null): unknown };
    component.render({ value: 'first\nsecond\nthird', language: 'plaintext', compact: true }, null);
    const host = { style: { height: '' } };
    fixture.references[0]!.current = host;
    const cleanup = fixture.effects[0]!();

    expect(host.style.height).toBe(`${86 + borderWidth * 2}px`);
    fixture.editor.getContentHeight.mockReturnValue(94);
    fixture.editor.onDidContentSizeChange.mock.calls[0]![0]();
    expect(host.style.height).toBe(`${94 + borderWidth * 2}px`);
    expect(fixture.editor.layout).toHaveBeenCalledTimes(2);
    (cleanup as () => void)();
    expect(fixture.sizeSubscription.dispose).toHaveBeenCalledOnce();
  });
});

describe('CodeViewer model disposal', () => {
  it('lets the editor detach and dispose its implicit model once when a body mode unmounts', () => {
    const component = CodeViewer as unknown as { render(props: CodeViewerProps, ref: null): unknown };
    component.render({ value: 'body{color:red}', language: 'css' }, null);
    fixture.references[0]!.current = {};
    const cleanup = fixture.effects[0]!();

    expect(typeof cleanup).toBe('function');
    expect(() => (cleanup as () => void)()).not.toThrow();
    expect(fixture.editor.dispose).toHaveBeenCalledOnce();
    expect(fixture.model.dispose).toHaveBeenCalledOnce();
  });
});