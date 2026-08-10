import type { editor } from 'monaco-editor/editor/editor.api';

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
  for (const editorInstance of editors) editorInstance.layout();
};