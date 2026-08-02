import { useEffect, useRef } from 'react';

import { cx } from '../share/cx';
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

/** Read-only Monaco viewer for captured bodies and messages. */
export function CodeViewer({
  value,
  language,
  compact = false,
  parityId,
}: CodeViewerProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const initial = useRef({ value, language });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const editor = monaco.editor.create(host, {
      ...VIEWER_OPTIONS,
      value: initial.current.value,
      language: initial.current.language,
      lineHeight: compact ? 17 : VIEWER_OPTIONS.lineHeight,
      fontSize: compact ? 10.5 : VIEWER_OPTIONS.fontSize,
      padding: compact ? { top: 10, bottom: 10 } : VIEWER_OPTIONS.padding,
    });
    editorRef.current = editor;
    // Compact viewers hug their content; full-size ones are sized by CSS (flex fill
    // with a 320px floor) and followed by automaticLayout.
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
}
