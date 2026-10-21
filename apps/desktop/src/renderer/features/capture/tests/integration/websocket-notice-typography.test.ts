import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('preserves the original 17px line height for the WebSocket message notice', () => {
  const stylesheet = readFileSync(
    new URL('../../BreakpointInspector/WebSocketBreakpointInspector.module.css', import.meta.url),
    'utf8',
  );
  const noticeText = stylesheet.match(/\.replacementOff\s*>\s*span\s*\{([^}]*)\}/)?.[1];

  expect(noticeText).toMatch(/line-height:\s*17px\s*;/);
});
