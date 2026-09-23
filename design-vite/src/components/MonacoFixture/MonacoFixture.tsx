import { useEffect, useRef, type HTMLAttributes } from 'react';

import { useDesignState } from '../../state/useDesignState';
import { applyMonacoFixtureTheme, monaco } from './monacoSetup';
import { registerMonacoFixture } from './registry';
import styles from './MonacoFixture.module.css';

export type MonacoFixturePreset = 'box' | 'fill' | 'edit' | 'message';

const PRESETS = {
  box: { fontSize: 12, lineHeight: 20, padding: 13 },
  message: { fontSize: 12, lineHeight: 20, padding: 13 },
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
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
        useShadows: false,
        alwaysConsumeMouseWheel: false,
      },
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
    let viewportObserver: ResizeObserver | undefined;
    if (preset === 'box' || preset === 'message') {
      let initialHeightApplied = false;
      let scrollContainer = host.parentElement;
      while (scrollContainer && !/auto|scroll/.test(getComputedStyle(scrollContainer).overflowY)) {
        scrollContainer = scrollContainer.parentElement;
      }
      const resize = () => {
        const style = getComputedStyle(host);
        const borderHeight = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
        const contentHeight = editorInstance.getContentHeight() + borderHeight;
        const availableHeight = scrollContainer
          ? scrollContainer.clientHeight - scrollContainer.scrollTop
            - host.getBoundingClientRect().top + scrollContainer.getBoundingClientRect().top
          : contentHeight;
        const minimumHeight = geometry.lineHeight + geometry.padding * 2 + borderHeight;
        let height = contentHeight;
        if (state.compactBodyLayout === 'viewport' && scrollContainer) {
          const maximumHeight = Math.max(minimumHeight, availableHeight);
          height = Math.min(initialHeightApplied ? host.getBoundingClientRect().height : contentHeight, maximumHeight);
          host.style.minHeight = `${minimumHeight}px`;
          host.style.maxHeight = `${maximumHeight}px`;
        }
        host.style.height = `${height}px`;
        initialHeightApplied = true;
        editorInstance.layout();
      };
      contentSizeDisposable = editorInstance.onDidContentSizeChange(resize);
      if (state.compactBodyLayout === 'viewport' && scrollContainer) {
        viewportObserver = new ResizeObserver(resize);
        viewportObserver.observe(scrollContainer);
      }
      resize();
    }
    return () => {
      unregister();
      viewportObserver?.disconnect();
      contentSizeDisposable?.dispose();
      if (state.compactBodyLayout === 'viewport') {
        host.style.minHeight = '';
        host.style.maxHeight = '';
      }
      editorInstance.dispose();
      model.dispose();
    };
  }, [language, preset, source, state.compactBodyLayout]);

  useEffect(() => {
    applyMonacoFixtureTheme(state.theme);
  }, [state.theme]);

  return <div
    {...attributes}
    className={state.compactBodyLayout === 'viewport' && (preset === 'box' || preset === 'message')
      ? [attributes.className, styles.resizableBodyPreview].filter(Boolean).join(' ')
      : attributes.className}
    ref={hostRef}
    data-fixture-node=""
    data-monaco={preset}
  />;
}