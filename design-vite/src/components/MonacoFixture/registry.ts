import type { editor } from 'monaco-editor/editor/editor.api';

import { monaco } from './monacoSetup';

const editors = new Set<editor.IStandaloneCodeEditor>();

function updateReadyState(): void {
  window.__monacoReady = document.querySelectorAll('[data-monaco]').length === editors.size;
}

export function registerMonacoFixture(editorInstance: editor.IStandaloneCodeEditor): () => void {
  editors.add(editorInstance);
  updateReadyState();
  return () => {
    editors.delete(editorInstance);
    updateReadyState();
  };
}

window.__monacoReady = false;
window.__monacoRelayout = () => {
  // The webfont can land after the editors are created; without remeasuring, wordWrap keeps
  // wrapping against the fallback metrics and every line below drifts a little further off.
  monaco.editor.remeasureFonts();
  for (const editorInstance of editors) editorInstance.layout();
};