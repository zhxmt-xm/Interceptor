import type { BreakpointEdit, WebSocketBreakpointSettings } from '@interceptor/core-protocol';
import { describe, expect, it } from 'vitest';
import { RuleService } from '../../entry';
import { BreakpointQueue } from '../../internal/breakpoint-queue';
import type { WebSocketMessageInput } from '../../interfaces';

const message: WebSocketMessageInput = {
  exchangeId: 'recorded-ws', url: 'ws://example.test/socket', direction: 'client-to-server',
  frame: 'message', content: Buffer.from('original'), isBinary: false,
};
const settings: WebSocketBreakpointSettings = { exchangeId: 'recorded-ws', direction: 'both', frames: ['message'] };

function setup() {
  const breakpointQueue = new BreakpointQueue();
  const ruleService = new RuleService(breakpointQueue);
  const abortController = new AbortController();
  return { breakpointQueue, ruleService, abortController };
}

async function waitForBreakpoint(breakpointQueue: BreakpointQueue, deciding: Promise<unknown>, count = 1): Promise<void> {
  await Promise.race([
    expect.poll(() => breakpointQueue.size).toBe(count),
    deciding.then(() => { throw new Error('Message completed before the expected breakpoint.'); }),
  ]);
}

describe('Shared WebSocket decisions', () => {
  it.each([
    null,
    { ...settings, exchangeId: 'other' },
    { ...settings, direction: 'server-to-client' as const },
    { ...settings, frames: ['ping' as const] },
  ])('bypasses unmatched settings without waiting for Capture: %j', async selected => {
    const { ruleService, breakpointQueue, abortController } = setup();
    await expect(ruleService.evaluateWebSocketMessage(message, selected, new Promise(() => {}), abortController.signal))
      .resolves.toEqual({ kind: 'bypass' });
    expect(breakpointQueue.size).toBe(0);
  });

  it('does not suspend an unrecorded connection under a different captured identity', async () => {
    const { ruleService, abortController } = setup();
    await expect(ruleService.evaluateWebSocketMessage({ ...message, exchangeId: undefined }, settings,
      new Promise(() => {}), abortController.signal)).resolves.toEqual({ kind: 'bypass' });
  });

  it('waits for the original frame identity and keeps WS independent from the HTTP toggle', async () => {
    const { ruleService, breakpointQueue, abortController } = setup();
    ruleService.disableBreakpoints();
    let release!: (sequence: number) => void;
    const captured = new Promise<number>(resolve => { release = resolve; });
    const deciding = ruleService.evaluateWebSocketMessage(message, settings, captured, abortController.signal);
    expect(breakpointQueue.size).toBe(0);
    release(7);
    await waitForBreakpoint(breakpointQueue, deciding);
    const pending = breakpointQueue.list()[0]!;
    expect(pending.snapshot).toMatchObject({
      exchangeId: message.exchangeId, url: message.url, direction: message.direction, frame: 'message',
      body: 'original', bodyFormat: 'text', bodyAvailable: true, opcode: 1, webSocketFrameSequence: 7,
    });
    breakpointQueue.resolve(pending.id, 'continue');
    await expect(deciding).resolves.toEqual({ kind: 'bypass' });
  });

  it.each([
    { isBinary: false, edit: { body: '修改🙂' }, expected: Buffer.from('修改🙂') },
    { isBinary: true, edit: { body: '00 FF\t7a' }, expected: Buffer.from([0, 255, 122]) },
  ])('applies exact text or binary bytes without changing the frame kind ($isBinary)', async ({ isBinary, edit, expected }) => {
    const { ruleService, breakpointQueue, abortController } = setup();
    const deciding = ruleService.evaluateWebSocketMessage({ ...message, isBinary }, settings, Promise.resolve(1), abortController.signal);
    await waitForBreakpoint(breakpointQueue, deciding);
    breakpointQueue.resolve(breakpointQueue.list()[0]!.id, 'continue', edit);
    const result = await deciding;
    expect(result.kind).toBe('replace');
    if (result.kind !== 'replace') throw new Error('Expected replacement');
    expect(Buffer.from(result.content).equals(expected)).toBe(true);
  });

  it('changes a close code without replacing its reason', async () => {
    const { ruleService, breakpointQueue, abortController } = setup();
    const deciding = ruleService.evaluateWebSocketMessage({ ...message, frame: 'close', closeCode: 1000 },
      { ...settings, frames: ['close'] }, Promise.resolve(undefined), abortController.signal);
    await waitForBreakpoint(breakpointQueue, deciding);
    breakpointQueue.resolve(breakpointQueue.list()[0]!.id, 'continue', { closeCode: 1001 });
    await expect(deciding).resolves.toEqual({ kind: 'replace', content: message.content, closeCode: 1001 });
  });

  it('drops only the current message when the user selects Drop', async () => {
    const { ruleService, breakpointQueue, abortController } = setup();
    const deciding = ruleService.evaluateWebSocketMessage(message, settings, Promise.resolve(1), abortController.signal);
    await waitForBreakpoint(breakpointQueue, deciding);
    breakpointQueue.resolve(breakpointQueue.list()[0]!.id, 'drop');
    await expect(deciding).resolves.toEqual({ kind: 'drop' });
    expect(abortController.signal.aborted).toBe(false);
  });

  it('does not create a late breakpoint after cancellation while Capture is pending', async () => {
    const { ruleService, breakpointQueue, abortController } = setup();
    let release!: (sequence: number) => void;
    const deciding = ruleService.evaluateWebSocketMessage(message, settings,
      new Promise<number>(resolve => { release = resolve; }), abortController.signal);
    abortController.abort();
    release(1);
    await expect(deciding).resolves.toEqual({ kind: 'aborted' });
    expect(breakpointQueue.size).toBe(0);
  });

  it('returns cancellation without waiting for an unresolved Capture operation', async () => {
    const { ruleService, breakpointQueue, abortController } = setup();
    const deciding = ruleService.evaluateWebSocketMessage(message, settings, new Promise(() => {}), abortController.signal);
    abortController.abort();
    await expect(deciding).resolves.toEqual({ kind: 'aborted' });
    expect(breakpointQueue.size).toBe(0);
  });

  it('cancels the pending queue and does not turn a late Continue into forwarding', async () => {
    const { ruleService, breakpointQueue, abortController } = setup();
    const deciding = ruleService.evaluateWebSocketMessage(message, settings, Promise.resolve(1), abortController.signal);
    await waitForBreakpoint(breakpointQueue, deciding);
    breakpointQueue.resolve(breakpointQueue.list()[0]!.id, 'continue');
    abortController.abort();
    await expect(deciding).resolves.toEqual({ kind: 'aborted' });
    expect(breakpointQueue.size).toBe(0);
  });

  it('does not cancel another connection when one signal aborts', async () => {
    const { ruleService, breakpointQueue, abortController } = setup();
    const otherController = new AbortController();
    const first = ruleService.evaluateWebSocketMessage(message, settings, Promise.resolve(1), abortController.signal);
    const second = ruleService.evaluateWebSocketMessage({ ...message, exchangeId: 'other' },
      { ...settings, exchangeId: 'other' }, Promise.resolve(2), otherController.signal);
    await waitForBreakpoint(breakpointQueue, Promise.all([first, second]), 2);
    abortController.abort();
    await expect(first).resolves.toEqual({ kind: 'aborted' });
    expect(breakpointQueue.size).toBe(1);
    breakpointQueue.resolve(breakpointQueue.list()[0]!.id, 'continue');
    await expect(second).resolves.toEqual({ kind: 'bypass' });
  });

  it('surfaces an invalid binary edit instead of bypassing it', async () => {
    const { ruleService, breakpointQueue, abortController } = setup();
    const deciding = ruleService.evaluateWebSocketMessage({ ...message, isBinary: true }, settings, Promise.resolve(1), abortController.signal);
    const rejected = expect(deciding).rejects.toThrow('hexadecimal bytes');
    try {
      await waitForBreakpoint(breakpointQueue, deciding);
      const edit: BreakpointEdit = { body: 'not-hex' };
      breakpointQueue.resolve(breakpointQueue.list()[0]!.id, 'continue', edit);
    } finally {
      await rejected;
    }
  });
});
