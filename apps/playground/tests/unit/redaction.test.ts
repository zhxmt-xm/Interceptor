import { describe, expect, it } from 'vitest';

import { redactMcpExchange } from '../../src/mcp/redaction';

describe('redactMcpExchange', () => {
  it('removes Bearer values from headers and nested protocol text', () => {
    const redacted = redactMcpExchange({
      body: '{"debug":"Bearer playground-secret"}',
      headers: {
        Authorization: 'Bearer playground-secret',
        'Content-Type': 'application/json',
      },
    }, 'playground-secret');

    expect(redacted).toEqual({
      body: '{"debug":"Bearer <redacted>"}',
      headers: {
        Authorization: 'Bearer <redacted>',
        'Content-Type': 'application/json',
      },
    });
    expect(JSON.stringify(redacted)).not.toContain('playground-secret');
  });
});