// Real Monaco instances for every text/JSON body viewer in the design SPA.
// The mockup has to show what Monaco actually renders, so the React implementation
// has a truthful 1:1 target instead of a hand-styled approximation.
//
// Any element with [data-monaco] is replaced by a read-only editor:
//   data-monaco="box"  -> hugs its content, used by inline message payloads
//   data-monaco="fill" -> absorbs the leftover panel height (CSS floor of 320px)
//   data-lang="json|html|..."
// The element's text content is the source; leading indentation is stripped.

const CDN = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.56.0/min';

self.MonacoEnvironment = {
  getWorkerUrl: () => URL.createObjectURL(new Blob([
    `self.MonacoEnvironment={baseUrl:'${CDN}/'};importScripts('${CDN}/vs/base/worker/workerMain.js');`,
  ], { type: 'text/javascript' })),
};

// Hex literals duplicated from the app.css theme tokens: Monaco themes are declared in
// JS and cannot read CSS custom properties, so these two must be kept in sync by hand.
const THEMES = {
  light: { base: 'vs', bg: '#f1f1ef', fg: '#1a1b1e', punct: '8b8e96', key: '8b3fd9', str: '12a150', num: '2570e0', sel: '#6a5bf017' },
  dark: { base: 'vs-dark', bg: '#171922', fg: '#f3f4f8', punct: '646b7b', key: 'c07cff', str: '3ecf8e', num: '5b9dff', sel: '#2fd4b821' },
  warm: { base: 'vs', bg: '#efe7da', fg: '#2c2620', punct: '9c917f', key: '9a5cc0', str: '3f8f4f', num: '3f7fb0', sel: '#c2703a1f' },
  ember: { base: 'vs-dark', bg: '#26201a', fg: '#f4eee3', punct: '8b8273', key: 'c6a3d8', str: '93c389', num: '84b0cf', sel: '#d99a3c26' },
};

// Shared per-preset geometry so .bodybox and .jsonv keep their own design metrics.
const PRESETS = {
  box: { fontSize: 12, lineHeight: 20, padding: 13 },
  fill: { fontSize: 12, lineHeight: 21, padding: 16 },
};

function defineThemes(monaco) {
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
        // rainbow brackets survive `bracketPairColorization:false`, so every level
        // has to be flattened to the design's punctuation colour as well
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
}

/** Strips the HTML source indentation so the markup stays readable. */
function dedent(raw) {
  const lines = raw.replace(/\t/g, '  ').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  const indent = Math.min(...lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^ */)[0].length));
  return lines.map((line) => line.slice(indent)).join('\n');
}

const editors = [];

function mount(monaco, host) {
  const preset = PRESETS[host.dataset.monaco] ?? PRESETS.box;
  const fill = host.dataset.monaco === 'fill';
  const value = dedent(host.textContent);
  host.textContent = '';

  const editor = monaco.editor.create(host, {
    value,
    language: host.dataset.lang || 'json',
    theme: `ix-${document.querySelector('.app').getAttribute('data-theme') || 'light'}`,
    // read-only viewer: no caret affordances, no validation squiggles
    readOnly: true,
    domReadOnly: true,
    renderValidationDecorations: 'off',
    contextmenu: false,
    hover: { enabled: 'off' },
    // remove every default chrome the design system does not have
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
    // design tokens
    fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
    fontSize: preset.fontSize,
    lineHeight: preset.lineHeight,
    padding: { top: preset.padding, bottom: preset.padding },
    wordWrap: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    folding: true,
    stickyScroll: { enabled: true, maxLineCount: 2 },
  });

  if (!fill) {
    const resize = () => {
      host.style.height = `${editor.getContentHeight()}px`;
      editor.layout();
    };
    editor.onDidContentSizeChange(resize);
    resize();
  }
  editors.push(editor);
}

require.config({ paths: { vs: `${CDN}/vs` } });
require(['vs/editor/editor.main'], () => {
  defineThemes(monaco);
  for (const host of document.querySelectorAll('[data-monaco]')) {
    mount(monaco, host);
  }

  const app = document.querySelector('.app');
  const applyTheme = () => {
    monaco.editor.setTheme(`ix-${app.getAttribute('data-theme') || 'light'}`);
  };
  new MutationObserver(applyTheme).observe(app, { attributes: true, attributeFilter: ['data-theme'] });
  applyTheme();

  // Editors created inside a hidden tab measure as zero; shoot.mjs calls this after
  // every __setState so the newly visible panel is laid out before the screenshot.
  window.__monacoRelayout = () => {
    for (const editor of editors) {
      editor.layout();
    }
  };
  window.__monacoReady = true;
});
