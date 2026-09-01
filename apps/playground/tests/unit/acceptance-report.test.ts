import { describe, expect, it } from 'vitest';

import { buildAcceptanceReport } from '../../src/acceptance/report';

describe('buildAcceptanceReport', () => {
  it('exports protocol, live Tool schema, manual facts, and no Bearer value', async () => {
    const report = await buildAcceptanceReport({
      connection: {
        credentialFingerprint: 'fingerprint',
        protocol: '2026-07-28',
        serverName: 'Interceptor',
        serverVersion: '0.1.0',
        tools: [{
          name: 'get_proxy_status',
          title: 'Proxy status',
          inputSchema: { type: 'object', properties: {} },
        }],
      },
      endpoint: 'http://127.0.0.1:43127/mcp',
      exchanges: [{
        durationMs: 12,
        id: 'exchange-1',
        request: {
          body: '{}',
          headers: { authorization: 'Bearer <redacted>' },
          method: 'POST',
          url: 'http://127.0.0.1:43127/mcp',
        },
        response: { body: '{}', headers: {}, status: 200 },
        startedAt: '2026-09-01T00:00:00.000Z',
        state: 'complete',
      }],
      manualRecords: {
        get_proxy_status: { notes: 'Matches Recording state.', status: 'pass' },
      },
      token: 'playground-secret',
      trafficResults: [],
    });

    expect(report.protocol).toBe('2026-07-28');
    expect(report.tools[0]).toMatchObject({
      name: 'get_proxy_status',
      schemaHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      status: 'pass',
    });
    expect(JSON.stringify(report)).not.toContain('playground-secret');
  });
});