import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('preserves the original App shell line-height multiplier', () => {
  const stylesheet = readFileSync(
    new URL('../../App.module.css', import.meta.url),
    'utf8',
  );
  const app = stylesheet.match(/\.app\s*\{([^}]*)\}/)?.[1];

  expect(app).toMatch(/line-height:\s*1\.23\s*;/);
});

it('loads the original variable monospace family without a competing discrete registration', () => {
  const entry = readFileSync(new URL('../../../main.tsx', import.meta.url), 'utf8');
  const fonts = readFileSync(new URL('../../../styles/fonts.css', import.meta.url), 'utf8');

  expect(entry).toContain("import '@fontsource-variable/jetbrains-mono/wght.css';");
  expect(fonts).not.toContain("font-family: 'JetBrains Mono'");
});
