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

const animationFrames = new Map<number, FrameRequestCallback>();
let nextFrameId = 0;

function flushAnimationFrame(): void {
  const callbacks = [...animationFrames.values()];
  animationFrames.clear();
  callbacks.forEach(callback => callback(0));
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.references.length = 0;
  fixture.effects.length = 0;
  fixture.editor.getContentHeight.mockReturnValue(86);
  animationFrames.clear();
  nextFrameId = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const id = nextFrameId++;
    animationFrames.set(id, callback);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
    animationFrames.delete(id);
  }));
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
    flushAnimationFrame();
    expect(host.style.height).toBe(`${94 + borderWidth * 2}px`);
    expect(fixture.editor.layout).toHaveBeenCalledTimes(2);
    (cleanup as () => void)();
    expect(fixture.sizeSubscription.dispose).toHaveBeenCalledOnce();
  });
});

describe('Resizable message CodeViewer', () => {
  function mount(contentHeight: number) {
    const changes: (() => void)[] = [];
    const observed = new Set<unknown>();
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { changes.push(callback); }
      observe = vi.fn((element: unknown) => observed.add(element));
      disconnect = disconnect;
    });
    let visible = true;
    let precedingHeight = 0;
    const precedingSection = { previousElementSibling: null };
    const scroll = {
      clientHeight: 681,
      scrollTop: 0,
      parentElement: null,
      getBoundingClientRect: () => ({ top: 100 }),
    };
    const host = {
      style: { height: '', minHeight: '', maxHeight: '' },
      clientWidth: 386,
      parentElement: scroll,
      previousElementSibling: precedingSection,
      getClientRects: () => visible ? [{}] : [],
      getBoundingClientRect: () => ({ top: 340 + precedingHeight - scroll.scrollTop, height: Number.parseFloat(host.style.height) || 0 }),
    };
    vi.stubGlobal('getComputedStyle', vi.fn((element) => element === host
      ? { borderTopWidth: '1', borderBottomWidth: '1', overflowY: 'hidden' }
      : { overflowY: 'auto' }));
    fixture.editor.getContentHeight.mockReturnValue(contentHeight);
    const component = CodeViewer as unknown as { render(props: CodeViewerProps, ref: null): unknown };
    component.render({ value: 'message', language: 'plaintext', compact: true, resizable: true }, null);
    fixture.references[0]!.current = host;
    const notifyResize = () => changes.forEach(callback => callback());
    return {
      host, scroll, changes, disconnect,
      hide: () => { visible = false; },
      show: () => { visible = true; },
      start: () => fixture.effects[0]!(),
      notifyResize,
      resize: () => {
        notifyResize();
        flushAnimationFrame();
      },
      resizePrecedingSection: (height: number) => {
        precedingHeight = height;
        if (observed.has(precedingSection)) {
          notifyResize();
          flushAnimationFrame();
        }
      },
    };
  }

  it('limits a long message to the current scroll viewport without changing the model', () => {
    const view = mount(2686);
    view.start();
    expect(view.host.style.height).toBe('441px');
    expect(view.host.style.maxHeight).toBe('441px');
    expect(view.host.style.minHeight).toBe('48px');
  });

  it('keeps short content natural and recomputes after wrapping without assuming a user resize', () => {
    const view = mount(126);
    view.start();
    expect(view.host.style.height).toBe('128px');
    fixture.editor.getContentHeight.mockReturnValue(166);
    fixture.editor.onDidContentSizeChange.mock.calls[0]![0]();
    flushAnimationFrame();
    expect(view.host.style.height).toBe('168px');
    expect(view.host.style.maxHeight).toBe('441px');
  });

  it('restores a manually resized message after its container shrinks and expands', () => {
    const view = mount(2686);
    const cleanup = view.start();
    view.host.style.height = '321px';
    view.resize();
    view.scroll.clientHeight = 481;
    view.resize();
    expect(view.host.style.height).toBe('241px');
    view.scroll.clientHeight = 681;
    view.resize();
    expect(view.host.style.height).toBe('321px');
    view.scroll.scrollTop = 120;
    view.resize();
    expect(view.host.style.maxHeight).toBe('441px');
    (cleanup as () => void)();
    expect(view.disconnect).toHaveBeenCalledOnce();
  });

  it('waits for visibility before choosing the initial height', () => {
    const view = mount(26);
    view.hide();
    view.start();
    expect(view.host.style.height).toBe('');
    view.show();
    fixture.editor.getContentHeight.mockReturnValue(126);
    view.resize();
    expect(view.host.style.height).toBe('128px');
  });

  it('reclamps a short preview when the preceding Original section changes height', () => {
    const view = mount(104);
    view.start();
    expect(view.host.style.height).toBe('106px');
    view.resizePrecedingSection(405);
    expect(view.host.style.height).toBe('48px');
    view.resizePrecedingSection(0);
    expect(view.host.style.height).toBe('106px');
  });

  it('defers and coalesces resize and content-size notifications outside observer delivery', () => {
    const view = mount(126);
    view.start();
    fixture.editor.getContentHeight.mockReturnValue(166);

    view.notifyResize();
    fixture.editor.onDidContentSizeChange.mock.calls[0]![0]();
    view.notifyResize();

    expect(view.host.style.height).toBe('128px');
    expect(fixture.editor.layout).toHaveBeenCalledOnce();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    expect(animationFrames.size).toBe(1);

    flushAnimationFrame();
    expect(view.host.style.height).toBe('168px');
    expect(fixture.editor.layout).toHaveBeenCalledTimes(2);
    expect(animationFrames.size).toBe(0);
  });

  it('cancels pending content sizing when the viewer unmounts', () => {
    const view = mount(126);
    const cleanup = view.start();
    view.notifyResize();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();

    if (!cleanup) throw new Error('Expected CodeViewer cleanup');
    cleanup();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(0);
    expect(animationFrames.size).toBe(0);

    flushAnimationFrame();
    expect(fixture.editor.layout).toHaveBeenCalledOnce();
    expect(fixture.editor.dispose).toHaveBeenCalledOnce();
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