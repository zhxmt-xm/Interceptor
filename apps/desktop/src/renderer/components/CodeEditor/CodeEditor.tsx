import { useEffect, useRef } from 'react';

import { monaco, VIEWER_OPTIONS } from '../CodeViewer/monacoSetup';

import styles from './CodeEditor.module.css';

export interface CodeEditorProps {
  value: string;
  /** Monaco language id, e.g. `json`, `plaintext`. */
  language: string;
  onValueChange: (value: string) => void;
  parityId?: string;
}

/** 可编辑的 Monaco 编辑器，与只读的 CodeViewer 共用同一 Monaco 入口和主题。 */
export function CodeEditor({
  value,
  language,
  onValueChange,
  parityId,
}: CodeEditorProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const initial = useRef({ value, language });
  // 编辑器自身触发的变更不该再被受控值写回，否则光标会跳到行首。
  const applyingExternal = useRef(false);
  const notify = useRef(onValueChange);
  notify.current = onValueChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const editor = monaco.editor.create(host, {
      ...VIEWER_OPTIONS,
      readOnly: false,
      domReadOnly: false,
      contextmenu: true,
      hover: { enabled: 'on' },
      renderValidationDecorations: 'on',
      value: initial.current.value,
      language: initial.current.language,
    });
    editorRef.current = editor;
    const changeListener = editor.onDidChangeModelContent(() => {
      if (!applyingExternal.current) {
        notify.current(editor.getValue());
      }
    });
    return () => {
      changeListener.dispose();
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) {
      return;
    }
    if (model.getValue() !== value) {
      applyingExternal.current = true;
      model.setValue(value);
      applyingExternal.current = false;
    }
    monaco.editor.setModelLanguage(model, language);
  }, [value, language]);

  return <div ref={hostRef} className={styles.host} data-parity={parityId} />;
}
