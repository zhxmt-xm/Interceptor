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
  automationId?: AutomationId;
  parityId?: string;
}

export interface CodeViewerHandle {
  /** Pretty-prints the current document in place. */
  format(): Promise<string | undefined>;
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
  automationId,
  parityId,
}, ref): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const initial = useRef({ value, language });

  useImperativeHandle(ref, () => ({
    async format(): Promise<string | undefined> {
      const editor = await waitForEditor(() => editorRef.current);
      const model = editor.getModel();
      if (!model) {
        return;
      }
      const version = model.getVersionId();
      let appliedValue: string | undefined;
      await formatCodeDocument({
        language: model.getLanguageId(),
        value: model.getValue(),
        replace: (nextValue) => {
          if (!model.isDisposed() && model.getVersionId() === version) {
            model.setValue(nextValue);
            appliedValue = nextValue;
          }
        },
        run: async () => {
          const formatted = await formatMonacoModel(model);
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
    // Compact viewers hug their content; full-size ones absorb whatever height the panel
    // leaves them and follow with automaticLayout.
    const hugContent = (): void => {
      const style = getComputedStyle(host);
      const borderHeight = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
      host.style.height = `${editor.getContentHeight() + borderHeight}px`;
      editor.layout();
    };
    const sizeListener = compact ? editor.onDidContentSizeChange(hugContent) : null;
    if (compact) {
      hugContent();
    }
    return () => {
      sizeListener?.dispose();
      editor.dispose();
      editorRef.current = null;
    };
  }, [compact]);

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
      className={cx(styles.host, compact && styles.compact)}
      data-automation-id={automationId}
      data-parity={parityId}
    />
  );
});
