import { describe, expect, it, vi } from 'vitest';

import { createObservedFetch } from '../../src/mcp/observed-fetch';

describe('createObservedFetch', () => {
  it('records a redacted exchange without consuming the SDK response', async () => {
    const records: unknown[] = [];
    const baseFetch = vi.fn(async () => new Response('{"resultType":"complete"}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const observedFetch = createObservedFetch(
      'playground-secret',
      (record) => records.push(record),
      baseFetch,
    );

    const response = await observedFetch('http://127.0.0.1:43127/mcp', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer playground-secret',
        'Content-Type': 'application/json',
      },
      body: '{"debug":"Bearer playground-secret"}',
    });

    expect(await response.text()).toBe('{"resultType":"complete"}');
    await vi.waitFor(() => expect(records).toHaveLength(2));
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      request: {
        body: '{"debug":"Bearer <redacted>"}',
        headers: { authorization: 'Bearer <redacted>' },
        method: 'POST',
      },
      state: 'pending',
    });
    expect(records[1]).toMatchObject({
      request: {
        body: '{"debug":"Bearer <redacted>"}',
        headers: { authorization: 'Bearer <redacted>' },
        method: 'POST',
        url: 'http://127.0.0.1:43127/mcp',
      },
      response: {
        body: '{"resultType":"complete"}',
        headers: { 'content-type': 'application/json' },
        status: 200,
      },
      state: 'complete',
    });
    expect((records[0] as { id: string }).id).toBe((records[1] as { id: string }).id);
    expect(JSON.stringify(records)).not.toContain('playground-secret');
  });

  it('returns a streaming response before the observed body completes', async () => {
    let finish!: () => void;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('first'));
        finish = () => {
          controller.enqueue(new TextEncoder().encode(' second'));
          controller.close();
        };
      },
    });
    const observedFetch = createObservedFetch(
      'token',
      () => undefined,
      async () => new Response(body),
    );

    const response = await Promise.race([
      observedFetch('http://127.0.0.1:43127/mcp'),
      new Promise<never>((_, reject) => setTimeout(
        () => reject(new Error('Observed fetch waited for the full response body.')),
        50,
      )),
    ]);
    finish();

    expect(await response.text()).toBe('first second');
  });
});