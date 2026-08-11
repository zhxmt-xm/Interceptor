import { useEffect, useRef, type HTMLAttributes } from 'react';

import { useDesignState } from '../../state/useDesignState';
import { applyMonacoFixtureTheme, monaco } from './monacoSetup';
import { registerMonacoFixture } from './registry';

export type MonacoFixturePreset = 'box' | 'fill' | 'edit';

const PRESETS = {
  box: { fontSize: 12, lineHeight: 20, padding: 13 },
  fill: { fontSize: 12, lineHeight: 21, padding: 16 },
  edit: { fontSize: 12, lineHeight: 21, padding: 16 },
} as const;

interface MonacoFixtureProps extends HTMLAttributes<HTMLDivElement> {
  readonly language: string;
  readonly preset: MonacoFixturePreset;
  readonly source: string;
}

export function MonacoFixture({ language, preset, source, ...attributes }: MonacoFixtureProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const { state } = useDesignState();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const geometry = PRESETS[preset];
    const editable = preset === 'edit';
    const model = monaco.editor.createModel(source, language);
    const editorInstance = monaco.editor.create(host, {
      model,
      theme: `ix-${state.theme}`,
      readOnly: !editable,
      domReadOnly: !editable,
      renderValidationDecorations: 'off',
      contextmenu: false,
      hover: { enabled: 'off' },
      lineNumbers: 'off',
      lineNumbersMinChars: 0,
      lineDecorationsWidth: 0,
      glyphMargin: false,
      minimap: { enabled: false },
      renderLineHighlight: 'none',
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false },
      guides: { indentation: false, highlightActiveIndentation: false },
      occurrencesHighlight: 'off',
      selectionHighlight: false,
      matchBrackets: 'never',
      bracketPairColorization: { enabled: false },
      fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: geometry.fontSize,
      lineHeight: geometry.lineHeight,
      padding: { top: geometry.padding, bottom: geometry.padding },
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      folding: true,
      stickyScroll: { enabled: true, maxLineCount: 2 },
    });
    const unregister = registerMonacoFixture(editorInstance);
    let contentSizeDisposable: monaco.IDisposable | undefined;
    if (preset === 'box') {
      const resize = () => {
        host.style.height = `${editorInstance.getContentHeight()}px`;
        editorInstance.layout();
      };
      contentSizeDisposable = editorInstance.onDidContentSizeChange(resize);
      resize();
    }
    return () => {
      unregister();
      contentSizeDisposable?.dispose();
      editorInstance.dispose();
      model.dispose();
    };
  }, [language, preset, source]);

  useEffect(() => {
    applyMonacoFixtureTheme(state.theme);
  }, [state.theme]);

  return <div {...attributes} ref={hostRef} data-fixture-node="" data-monaco={preset} />;
}