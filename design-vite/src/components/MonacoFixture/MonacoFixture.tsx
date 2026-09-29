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
  readonly resizable?: boolean;
  readonly source: string;
}

export function MonacoFixture({ language, preset, resizable = false, source, ...attributes }: MonacoFixtureProps): React.JSX.Element {
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
      let appliedHeight: number | undefined;
      let requestedHeight: number | undefined;
      let scrollContainer: HTMLElement | null = null;
      const resize = () => {
        if (resizable
          && (host.getClientRects().length === 0 || host.clientWidth === 0)) return;
        if (resizable) {
          let nextScrollContainer = host.parentElement;
          while (nextScrollContainer && !/auto|scroll/.test(getComputedStyle(nextScrollContainer).overflowY)) {
            nextScrollContainer = nextScrollContainer.parentElement;
          }
          if (nextScrollContainer !== scrollContainer) {
            if (scrollContainer) viewportObserver?.unobserve(scrollContainer);
            scrollContainer = nextScrollContainer;
            if (scrollContainer) viewportObserver?.observe(scrollContainer);
          }
          if (scrollContainer?.clientHeight === 0) return;
        }
        const style = getComputedStyle(host);
        const borderHeight = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
        const contentHeight = editorInstance.getContentHeight() + borderHeight;
        const availableHeight = scrollContainer
          ? scrollContainer.clientHeight - scrollContainer.scrollTop
            - host.getBoundingClientRect().top + scrollContainer.getBoundingClientRect().top
          : contentHeight;
        const minimumHeight = geometry.lineHeight + geometry.padding * 2 + borderHeight;
        let height = contentHeight;
        if (resizable && scrollContainer) {
          const inlineHeight = Number.parseFloat(host.style.height);
          if (appliedHeight !== undefined && Number.isFinite(inlineHeight) && Math.abs(inlineHeight - appliedHeight) > 0.5) {
            requestedHeight = inlineHeight;
          }
          const maximumHeight = Math.max(minimumHeight, availableHeight);
          height = Math.max(minimumHeight, Math.min(requestedHeight ?? contentHeight, maximumHeight));
          host.style.minHeight = `${minimumHeight}px`;
          host.style.maxHeight = `${maximumHeight}px`;
        }
        host.style.height = `${height}px`;
        appliedHeight = height;
        editorInstance.layout();
      };
      contentSizeDisposable = editorInstance.onDidContentSizeChange(resize);
      if (resizable) {
        viewportObserver = new ResizeObserver(resize);
        viewportObserver.observe(host);
      }
      resize();
    }
    return () => {
      unregister();
      viewportObserver?.disconnect();
      contentSizeDisposable?.dispose();
      if (resizable) {
        host.style.minHeight = '';
        host.style.maxHeight = '';
      }
      editorInstance.dispose();
      model.dispose();
    };
  }, [language, preset, resizable, source]);

  useEffect(() => {
    applyMonacoFixtureTheme(state.theme);
  }, [state.theme]);

  return <div
    {...attributes}
    className={resizable && (preset === 'box' || preset === 'message')
      ? [attributes.className, styles.resizableBodyPreview].filter(Boolean).join(' ')
      : attributes.className}
    ref={hostRef}
    data-fixture-node=""
    data-monaco={preset}
  />;
}