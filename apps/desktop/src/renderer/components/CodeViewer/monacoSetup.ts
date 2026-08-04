import * as monaco from 'monaco-editor/editor/editor.api';
// Only the languages the body viewer can select are registered; the package root would
// pull in all ~90 Monaco languages. JSON/CSS/HTML/TypeScript use the full language
// services because those ship the formatters and structural folding; the rest only
// have a tokenizer, so they get syntax colour and nothing else.
import { jsonDefaults } from 'monaco-editor/languages/features/json/register';
import { cssDefaults } from 'monaco-editor/languages/features/css/register';
import { htmlDefaults } from 'monaco-editor/languages/features/html/register';
import {
  javascriptDefaults,
  typescriptDefaults,
} from 'monaco-editor/languages/features/typescript/register';
import 'monaco-editor/languages/definitions/markdown/register';
import 'monaco-editor/languages/definitions/xml/register';
import 'monaco-editor/languages/definitions/yaml/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/languages/features/json/json.worker?worker';
import CssWorker from 'monaco-editor/languages/features/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/languages/features/html/html.worker?worker';
import TsWorker from 'monaco-editor/languages/features/typescript/ts.worker?worker';

/** Token hexes duplicated from styles/global.css: Monaco themes are declared in JS
 *  and cannot read CSS custom properties, so the two must be kept in sync by hand. */
const THEMES = {
  light: { base: 'vs', bg: '#f1f1ef', fg: '#1a1b1e', punct: '8b8e96', key: '8b3fd9', str: '12a150', num: '2570e0', sel: '#6a5bf017' },
  dark: { base: 'vs-dark', bg: '#171922', fg: '#f3f4f8', punct: '646b7b', key: 'c07cff', str: '3ecf8e', num: '5b9dff', sel: '#2fd4b821' },
  warm: { base: 'vs', bg: '#efe7da', fg: '#2c2620', punct: '9c917f', key: '9a5cc0', str: '3f8f4f', num: '3f7fb0', sel: '#c2703a1f' },
  ember: { base: 'vs-dark', bg: '#26201a', fg: '#f4eee3', punct: '8b8273', key: 'c6a3d8', str: '93c389', num: '84b0cf', sel: '#d99a3c26' },
} as const;

export type MonacoThemeMode = keyof typeof THEMES;

// Each language service runs in its own worker; missing an entry here silently falls
// back to the generic editor worker and the service stops working.
const WORKERS: Record<string, new () => Worker> = {
  json: JsonWorker,
  css: CssWorker,
  scss: CssWorker,
  less: CssWorker,
  html: HtmlWorker,
  handlebars: HtmlWorker,
  razor: HtmlWorker,
  typescript: TsWorker,
  javascript: TsWorker,
};

(globalThis as { MonacoEnvironment?: monaco.Environment }).MonacoEnvironment = {
  getWorker: (_workerId: string, label: string) => new (WORKERS[label] ?? EditorWorker)(),
};

// These are read-only views of someone else's traffic: validation would only burn
// worker CPU to draw squiggles the design system already hides.
const NO_DIAGNOSTICS = {
  noSemanticValidation: true,
  noSyntaxValidation: true,
  noSuggestionDiagnostics: true,
} as const;
javascriptDefaults.setDiagnosticsOptions(NO_DIAGNOSTICS);
typescriptDefaults.setDiagnosticsOptions(NO_DIAGNOSTICS);
jsonDefaults.setDiagnosticsOptions({ validate: false, schemaValidation: 'ignore' });
cssDefaults.setOptions({ validate: false });
htmlDefaults.setOptions({});

for (const [name, token] of Object.entries(THEMES)) {
  const punct = `#${token.punct}`;
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
      // rainbow brackets survive `bracketPairColorization:false`, so every level has
      // to be flattened to the design's punctuation colour as well
      'editorBracketHighlight.foreground1': punct,
      'editorBracketHighlight.foreground2': punct,
      'editorBracketHighlight.foreground3': punct,
      'editorBracketHighlight.foreground4': punct,
      'editorBracketHighlight.foreground5': punct,
      'editorBracketHighlight.foreground6': punct,
      'editorBracketHighlight.unexpectedBracket.foreground': punct,
    },
  });
}

/** Monaco keeps a single global theme, so one document-level observer serves every viewer. */
function syncTheme(): void {
  const mode = document.documentElement.dataset.theme;
  monaco.editor.setTheme(`ix-${mode && mode in THEMES ? mode : 'light'}`);
}

syncTheme();
new MutationObserver(syncTheme).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme'],
});

/** Re-exported so every viewer goes through this single, trimmed Monaco entry point. */
export { monaco };

/** Read-only viewer chrome: everything the design system does not draw is turned off. */
export const VIEWER_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  readOnly: true,
  domReadOnly: true,
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
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false },
  guides: { indentation: false, highlightActiveIndentation: false },
  occurrencesHighlight: 'off',
  selectionHighlight: false,
  matchBrackets: 'never',
  bracketPairColorization: { enabled: false },
  // Monaco measures the font itself, so the --font-mono stack is spelled out here.
  fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: 12,
  lineHeight: 21,
  padding: { top: 16, bottom: 16 },
  wordWrap: 'on',
  scrollBeyondLastLine: false,
  automaticLayout: true,
  folding: true,
  stickyScroll: { enabled: true, maxLineCount: 2 },
};
