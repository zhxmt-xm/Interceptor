import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/html/register';
import 'monaco-editor/languages/definitions/markdown/register';
import 'monaco-editor/languages/definitions/xml/register';
import 'monaco-editor/languages/definitions/yaml/register';
import { jsonDefaults } from 'monaco-editor/languages/features/json/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import HtmlWorker from 'monaco-editor/languages/features/html/html.worker?worker';
import JsonWorker from 'monaco-editor/languages/features/json/json.worker?worker';

const THEMES = {
  light: { base: 'vs', bg: '#f1f1ef', fg: '#1a1b1e', punct: '8b8e96', key: '8b3fd9', str: '12a150', num: '2570e0', sel: '#6a5bf017' },
  dark: { base: 'vs-dark', bg: '#171922', fg: '#f3f4f8', punct: '646b7b', key: 'c07cff', str: '3ecf8e', num: '5b9dff', sel: '#2fd4b821' },
  warm: { base: 'vs', bg: '#efe7da', fg: '#2c2620', punct: '9c917f', key: '9a5cc0', str: '3f8f4f', num: '3f7fb0', sel: '#c2703a1f' },
  ember: { base: 'vs-dark', bg: '#26201a', fg: '#f4eee3', punct: '8b8273', key: 'c6a3d8', str: '93c389', num: '84b0cf', sel: '#d99a3c26' },
} as const;

export type MonacoFixtureTheme = keyof typeof THEMES;

const WORKERS: Readonly<Record<string, new () => Worker>> = {
  html: HtmlWorker,
  json: JsonWorker,
};

(globalThis as { MonacoEnvironment?: monaco.Environment }).MonacoEnvironment = {
  getWorker: (_workerId: string, label: string) => new (WORKERS[label] ?? EditorWorker)(),
};

jsonDefaults.setDiagnosticsOptions({ validate: false, schemaValidation: 'ignore' });

for (const [name, token] of Object.entries(THEMES)) {
  const punctuation = `#${token.punct}`;
  monaco.editor.defineTheme(`ix-${name}`, {
    base: token.base,
    inherit: true,
    rules: [
      { token: 'string.key.json', foreground: token.key },
      { token: 'string.value.json', foreground: token.str },
      { token: 'string', foreground: token.str },
      { token: 'number', foreground: token.num },
      { token: 'keyword', foreground: token.num },
      { token: 'delimiter', foreground: token.punct },
      { token: 'comment', foreground: token.punct },
      { token: 'tag', foreground: token.num },
      { token: 'metatag', foreground: token.punct },
      { token: 'attribute.name', foreground: token.key },
      { token: 'attribute.value', foreground: token.str },
    ],
    colors: {
      'editor.background': token.bg,
      'editor.foreground': token.fg,
      'editor.selectionBackground': token.sel,
      'editor.lineHighlightBackground': '#00000000',
      'editorGutter.background': token.bg,
      'editorStickyScroll.background': token.bg,
      'editorStickyScrollHover.background': token.bg,
      'scrollbarSlider.background': token.sel,
      'scrollbarSlider.hoverBackground': token.sel,
      'scrollbarSlider.activeBackground': token.sel,
      'editorOverviewRuler.border': '#00000000',
      'editorBracketHighlight.foreground1': punctuation,
      'editorBracketHighlight.foreground2': punctuation,
      'editorBracketHighlight.foreground3': punctuation,
      'editorBracketHighlight.foreground4': punctuation,
      'editorBracketHighlight.foreground5': punctuation,
      'editorBracketHighlight.foreground6': punctuation,
      'editorBracketHighlight.unexpectedBracket.foreground': punctuation,
    },
  });
}

export function applyMonacoFixtureTheme(theme: MonacoFixtureTheme): void {
  monaco.editor.setTheme(`ix-${theme}`);
}

export { monaco };