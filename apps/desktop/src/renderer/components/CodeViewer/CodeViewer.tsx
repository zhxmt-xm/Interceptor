import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import type { AutomationId } from '../../../shared/automation-ids';
import { cx } from '../share/cx';
import { formatCodeDocument } from './formatCodeDocument';
import { formatMonacoModel, monaco, VIEWER_OPTIONS } from './monacoSetup';
import styles from './CodeViewer.module.css';

export interface CodeViewerProps {
  value: string;
  /** Monaco language id, e.g. `json`, `html`, `plaintext`. */
  language: string;
  /** Inline variant used by the WebSocket and gRPC message panels. */
  compact?: boolean;
  /** Bound an ordinary inline message to its viewport and allow vertical resizing. */
  resizable?: boolean;
  borderless?: boolean;
  automationId?: AutomationId;
  parityId?: string;
}

export interface CodeViewerHandle {
  /** Pretty-prints the current document in place. */
  format(language?: string): Promise<string | undefined>;
  /** Return the text currently displayed by Monaco. */
  value(): string | undefined;
}

const FORMAT_PROVIDER_TIMEOUT_MS = 5_000;

async function waitForEditor(
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null,
): Promise<monaco.editor.IStandaloneCodeEditor> {
  const deadline = performance.now() + FORMAT_PROVIDER_TIMEOUT_MS;
  let editor = getEditor();
  while (!editor) {
    if (performance.now() >= deadline) {
      throw new Error('Code viewer did not become ready.');
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    editor = getEditor();
  }
  return editor;
}

/** Read-only Monaco viewer for captured bodies and messages. */
export const CodeViewer = forwardRef<CodeViewerHandle, CodeViewerProps>(function CodeViewer({
  value,
  language,
  compact = false,
  resizable = false,
  borderless = false,
  automationId,
  parityId,
}, ref): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const initial = useRef({ value, language });

  useImperativeHandle(ref, () => ({
    async format(language?: string): Promise<string | undefined> {
      const editor = await waitForEditor(() => editorRef.current);
      const model = editor.getModel();
      if (!model) {
        return;
      }
      const version = model.getVersionId();
      let appliedValue: string | undefined;
      await formatCodeDocument({
        language: language ?? model.getLanguageId(),
        value: model.getValue(),
        replace: (nextValue) => {
          if (!model.isDisposed() && model.getVersionId() === version) {
            model.setValue(nextValue);
            appliedValue = nextValue;
          }
        },
        run: async () => {
          const formatModel = language && language !== model.getLanguageId()
            ? monaco.editor.createModel(model.getValue(), language) : model;
          let formatted: string;
          try { formatted = await formatMonacoModel(formatModel); }
          finally { if (formatModel !== model) formatModel.dispose(); }
          if (model.isDisposed() || model.getVersionId() !== version) {
            throw new Error('Code viewer changed while formatting.');
          }
          return formatted;
        },
      });
      return appliedValue;
    },
    value(): string | undefined {
      return editorRef.current?.getValue();
    },
  }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const editor = monaco.editor.create(host, {
      ...VIEWER_OPTIONS,
      value: initial.current.value,
      language: initial.current.language,
      lineHeight: compact ? 20 : VIEWER_OPTIONS.lineHeight,
      fontSize: VIEWER_OPTIONS.fontSize,
      padding: compact ? { top: 13, bottom: 13 } : VIEWER_OPTIONS.padding,
    });
    editorRef.current = editor;
    let appliedHeight: number | undefined;
    let requestedHeight: number | undefined;
    let scrollContainer = resizable && compact ? host.parentElement : null;
    while (scrollContainer && !/auto|scroll/.test(getComputedStyle(scrollContainer).overflowY)) {
      scrollContainer = scrollContainer.parentElement;
    }
    const hugContent = (): void => {
      if (resizable && (host.getClientRects().length === 0 || host.clientWidth === 0 || scrollContainer?.clientHeight === 0)) return;
      const style = getComputedStyle(host);
      const borderHeight = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
      const contentHeight = editor.getContentHeight() + borderHeight;
      let height = contentHeight;
      if (resizable && scrollContainer) {
        const inlineHeight = Number.parseFloat(host.style.height);
        if (appliedHeight !== undefined && Number.isFinite(inlineHeight) && Math.abs(inlineHeight - appliedHeight) > 0.5) {
          requestedHeight = inlineHeight;
        }
        const minimumHeight = 20 + 26 + borderHeight;
        const availableHeight = scrollContainer.clientHeight - scrollContainer.scrollTop
          - host.getBoundingClientRect().top + scrollContainer.getBoundingClientRect().top;
        const maximumHeight = Math.max(minimumHeight, availableHeight);
        height = Math.max(minimumHeight, Math.min(requestedHeight ?? contentHeight, maximumHeight));
        host.style.minHeight = `${minimumHeight}px`;
        host.style.maxHeight = `${maximumHeight}px`;
      }
      host.style.height = `${height}px`;
      appliedHeight = height;
      editor.layout();
    };
    const sizeListener = compact ? editor.onDidContentSizeChange(hugContent) : null;
    const observer = resizable && compact && scrollContainer ? new ResizeObserver(hugContent) : null;
    if (observer && scrollContainer) {
      observer.observe(scrollContainer);
      // Earlier sections can move the preview without resizing it or its scroll viewport.
      let current: HTMLElement | null = host;
      while (current && current !== scrollContainer) {
        observer.observe(current);
        let previous = current.previousElementSibling;
        while (previous) {
          observer.observe(previous);
          previous = previous.previousElementSibling;
        }
        current = current.parentElement;
      }
    }
    if (compact) {
      hugContent();
    }
    return () => {
      sizeListener?.dispose();
      observer?.disconnect();
      if (resizable) {
        host.style.minHeight = '';
        host.style.maxHeight = '';
      }
      editor.dispose();
      editorRef.current = null;
    };
  }, [compact, resizable]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) {
      return;
    }
    if (model.getValue() !== value) {
      model.setValue(value);
    }
    monaco.editor.setModelLanguage(model, language);
  }, [value, language]);

  return (
    <div
      ref={hostRef}
      className={cx(styles.host, compact && styles.compact, compact && resizable && styles.resizable, borderless && styles.borderless)}
      data-automation-id={automationId}
      data-parity={parityId}
    />
  );
});
