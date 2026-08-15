import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { cx } from '../share/cx';
import { formatCodeDocument } from './formatCodeDocument';
import { monaco, VIEWER_OPTIONS } from './monacoSetup';
import styles from './CodeViewer.module.css';

export interface CodeViewerProps {
  value: string;
  /** Monaco language id, e.g. `json`, `html`, `plaintext`. */
  language: string;
  /** Inline variant used by the WebSocket and gRPC message panels. */
  compact?: boolean;
  parityId?: string;
}

export interface CodeViewerHandle {
  /** Pretty-prints the current document in place. */
  format(): Promise<void>;
}

/** Read-only Monaco viewer for captured bodies and messages. */
export const CodeViewer = forwardRef<CodeViewerHandle, CodeViewerProps>(function CodeViewer({
  value,
  language,
  compact = false,
  parityId,
}, ref): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const initial = useRef({ value, language });

  useImperativeHandle(ref, () => ({
    async format(): Promise<void> {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!editor || !model) {
        return;
      }
      await formatCodeDocument({
        language: model.getLanguageId(),
        value: model.getValue(),
        replace: (nextValue) => model.setValue(nextValue),
        run: async () => editor.getAction('editor.action.formatDocument')?.run(),
        setReadOnly: (readOnly) => editor.updateOptions({ readOnly }),
      });
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
      host.style.height = `${editor.getContentHeight()}px`;
      editor.layout();
    };
    const sizeListener = compact ? editor.onDidContentSizeChange(hugContent) : null;
    if (compact) {
      hugContent();
    }
    return () => {
      sizeListener?.dispose();
      editor.getModel()?.dispose();
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
      data-parity={parityId}
    />
  );
});
