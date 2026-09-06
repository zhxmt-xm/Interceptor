import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CodeEditor } from '../../CodeEditor';

const fixture = vi.hoisted(() => {
  const model = { dispose: vi.fn() };
  const listener = { dispose: vi.fn() };
  const editor = {
    getModel: vi.fn(() => model),
    onDidChangeModelContent: vi.fn(() => listener),
    dispose: vi.fn(() => {
      if (model.dispose.mock.calls.length > 0) throw new Error('Model is disposed!');
      model.dispose();
    }),
  };
  return {
    editor, model, listener,
    references: [] as { current: unknown }[],
    effects: [] as (() => void | (() => void))[],
  };
});

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useRef: (value: unknown) => {
    const reference = { current: value };
    fixture.references.push(reference);
    return reference;
  },
  useEffect: (effect: () => void | (() => void)) => { fixture.effects.push(effect); },
}));
vi.mock('../../../CodeViewer/monacoSetup', () => ({
  monaco: { editor: { create: () => fixture.editor } },
  VIEWER_OPTIONS: {},
}));

beforeEach(() => {
  vi.clearAllMocks();
  fixture.references.length = 0;
  fixture.effects.length = 0;
});

describe('CodeEditor生命周期', () => {
  it('隐式Model由编辑器detach时销毁，包装器不先销毁仍被观察的Model', () => {
    CodeEditor({ value: '', language: 'json', onValueChange: vi.fn() });
    fixture.references[0]!.current = {};
    const cleanup = fixture.effects[0]!();

    expect(typeof cleanup).toBe('function');
    expect(() => (cleanup as () => void)()).not.toThrow();
    expect(fixture.listener.dispose).toHaveBeenCalledOnce();
    expect(fixture.editor.dispose).toHaveBeenCalledOnce();
    expect(fixture.model.dispose).toHaveBeenCalledOnce();
  });
});