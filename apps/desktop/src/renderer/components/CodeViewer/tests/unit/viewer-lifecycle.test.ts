import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CodeViewer, type CodeViewerProps } from '../../CodeViewer';

const fixture = vi.hoisted(() => {
  const model = { dispose: vi.fn() };
  const editor = {
    getModel: vi.fn(() => model),
    dispose: vi.fn(() => {
      if (model.dispose.mock.calls.length > 0) throw new Error('Model was disposed while attached.');
      model.dispose();
    }),
  };
  return { editor, model, references: [] as { current: unknown }[], effects: [] as (() => void | (() => void))[] };
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