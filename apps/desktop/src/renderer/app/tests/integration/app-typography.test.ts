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

it('loads the bundled variable families from local assets', () => {
  const entry = readFileSync(new URL('../../../main.tsx', import.meta.url), 'utf8');

  expect(entry).toContain("import '@fontsource-variable/noto-sans-sc/wght.css';");
  expect(entry).toContain("import '@fontsource-variable/jetbrains-mono/wght.css';");
  expect(entry).not.toContain('fonts.css');
});

it('puts the Chinese and Latin faces of one design first in the UI stack', () => {
  const stylesheet = readFileSync(
    new URL('../../../styles/global.css', import.meta.url),
    'utf8',
  );
  const root = stylesheet.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
  const ui = root.match(/--font-ui:\s*([^;]*);/)?.[1] ?? '';
  const mono = root.match(/--font-mono:\s*([^;]*);/)?.[1] ?? '';

  // 数字与汉字必须来自同一套字形；拉丁字体打头会让数字和汉字分属两套设计。
  expect(ui).toMatch(/^\s*"Noto Sans SC Variable"/);
  expect(ui).not.toMatch(/^\s*"Inter"/);
  // mono 保留等宽拉丁，CJK 仍回落到同一中文字面，不再交给系统字体。
  expect(mono).toMatch(/^\s*"JetBrains Mono Variable",\s*"JetBrains Mono",\s*"Noto Sans SC Variable"/);
});
