import { describe, expect, it } from 'vitest';

import { parseMcpConfiguration } from '../../src/mcp/config';

describe('parseMcpConfiguration', () => {
  it('reads the exact Interceptor HTTP configuration copied by the product', () => {
    const configuration = parseMcpConfiguration(JSON.stringify({
      servers: {
        interceptor: {
          type: 'http',
          url: 'http://127.0.0.1:43127/mcp',
          headers: { Authorization: 'Bearer playground-secret' },
        },
      },
    }));

    expect(configuration).toEqual({
      endpoint: 'http://127.0.0.1:43127/mcp',
      token: 'playground-secret',
    });
  });

  it.each([
    '{}',
    '{bad json',
    JSON.stringify({ servers: { interceptor: { type: 'stdio' } } }),
    JSON.stringify({
      servers: {
        interceptor: {
          type: 'http',
          url: 'http://127.0.0.1:43127/mcp',
          headers: { Authorization: 'Basic value' },
        },
      },
    }),
  ])('rejects configuration outside the copied product contract', (input) => {
    expect(() => parseMcpConfiguration(input)).toThrow('Invalid Interceptor MCP configuration.');
  });
});