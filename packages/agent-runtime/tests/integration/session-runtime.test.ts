import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AgentRuntime,
  type AgentProviderDraft,
  type AgentRuntimeEvent,
  type AgentSecureStore,
  type AgentSessionSnapshot,
} from '../../src';
import { AgentSessionStore } from '../../src/sessions/internal/session-store';
import type { StoredAgentSession } from '../../src/sessions/interfaces';

class FakeAgentSecureStore implements AgentSecureStore {
  encryptions = 0;
  encryptedPlaintextBytes = 0;
  failEncryption = false;
  failOnEncryption: number | null = null;
  decryptions = 0;
  failOnDecryption: number | null = null;
  isEncryptionAvailable(): boolean {
    return true;
  }

  encryptString(plaintext: string): Buffer {
    this.encryptions += 1;
    this.encryptedPlaintextBytes += Buffer.byteLength(plaintext);
    if (this.failEncryption || this.failOnEncryption === this.encryptions) {
      throw new Error('secure storage write failed');
    }
    return Buffer.from(Buffer.from(plaintext, 'utf8').toString('base64'), 'utf8');
  }

  decryptString(data: Buffer): string {
    this.decryptions += 1;
    if (this.failOnDecryption === this.decryptions) {
      this.failOnDecryption = null;
      throw new Error('temporary secure storage read failure');
    }
    return Buffer.from(data.toString('utf8'), 'base64').toString('utf8');
  }
}

interface ScriptedResponse {
  readonly chunks: readonly string[];
  readonly waitForAbort?: boolean;
  readonly fetchError?: Error;
  readonly abortGate?: Promise<void>;
  readonly onAbort?: () => void;
}

class SessionFixture {
  readonly secureStore = new FakeAgentSecureStore();
  readonly requests: Array<Record<string, unknown>> = [];
  readonly responses: ScriptedResponse[] = [];
  private nextId = 1;
  private now = Date.parse('2026-08-29T00:00:00.000Z');
  readonly runtimes: AgentRuntime[] = [];

  constructor(readonly root: string) {}

  readonly fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    this.requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const scriptedResponse = this.responses.shift() ?? {
      chunks: [
        sse({ choices: [{ delta: { content: 'OK' } }] }),
        'data: [DONE]\n\n',
      ],
    };
    if (scriptedResponse.fetchError !== undefined) {
      throw scriptedResponse.fetchError;
    }
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of scriptedResponse.chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        if (scriptedResponse.waitForAbort) {
          init?.signal?.addEventListener('abort', () => {
            scriptedResponse.onAbort?.();
            void (scriptedResponse.abortGate ?? Promise.resolve()).then(() => {
              controller.error(init.signal?.reason);
            });
          }, { once: true });
        } else {
          controller.close();
        }
      },
    });
    return new Response(body, {
      headers: { 'content-type': 'text/event-stream' },
      status: 200,
    });
  });

  createRuntime(): AgentRuntime {
    const agentRuntime = new AgentRuntime({
      dataDirectory: this.root,
      fetcher: this.fetcher as typeof fetch,
      secureStore: this.secureStore,
      tools: [],
      createId: () => `id-${this.nextId++}`,
      now: () => this.now++,
    });
    this.runtimes.push(agentRuntime);
    return agentRuntime;
  }

  enqueueComplete(
    text: string,
    reasoning: string,
    usage: {
      input: number;
      output: number;
      hit: number;
      miss: number;
    },
  ): void {
    this.responses.push({
      chunks: [
        sse({ choices: [{ delta: { reasoning_content: reasoning } }] }),
        sse({ choices: [{ delta: { content: text.slice(0, 3) } }] }),
        sse({ choices: [{ delta: { content: text.slice(3) } }] }),
        sse({
          choices: [],
          usage: {
            prompt_tokens: usage.input,
            completion_tokens: usage.output,
            total_tokens: usage.input + usage.output,
            prompt_cache_hit_tokens: usage.hit,
            prompt_cache_miss_tokens: usage.miss,
          },
        }),
        'data: [DONE]\n\n',
      ],
    });
  }

  enqueuePartial(text: string): void {
    this.responses.push({
      chunks: [sse({ choices: [{ delta: { content: text } }] })],
      waitForAbort: true,
    });
  }
}

const roots: string[] = [];
const fixtures: SessionFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).flatMap((fixture) =>
    fixture.runtimes.map((agentRuntime) => agentRuntime.stop().catch(() => undefined))));
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('AgentRuntime persistent Sessions', () => {
  it('encrypts Session content and restores list order, selection and transcript', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    await configureProvider(agentRuntime);
    fixture.requests.length = 0;

    const first = await agentRuntime.createSession();
    await agentRuntime.renameSession(first.sessionId, 'Renamed private chat');
    fixture.enqueueComplete('private answer', 'private reasoning', {
      input: 12,
      output: 3,
      hit: 8,
      miss: 4,
    });
    await completeTurn(agentRuntime, first.sessionId, 'private prompt');
    const second = await agentRuntime.createSession();
    await agentRuntime.selectSession(first.sessionId);
    await agentRuntime.stop();

    const databaseBytes = await readFile(path.join(fixture.root, 'agent.sqlite'));
    for (const plaintext of [
      'private prompt',
      'private answer',
      'private reasoning',
      'Renamed private chat',
    ]) {
      expect(databaseBytes.includes(Buffer.from(plaintext, 'utf8'))).toBe(false);
    }

    const restoredRuntime = fixture.createRuntime();
    await restoredRuntime.start();
    const sessions = await restoredRuntime.listSessions();
    expect(sessions.currentSessionId).toBe(first.sessionId);
    expect(sessions.sessions.map((session) => session.sessionId)).toEqual([
      second.sessionId,
      first.sessionId,
    ]);
    const restored = await restoredRuntime.getSession(first.sessionId);
    expect(restored.summary.title).toBe('Renamed private chat');
    expect(restored.items).toMatchObject([
      { kind: 'user-message', content: 'private prompt' },
      {
        kind: 'assistant-message',
        content: 'private answer',
        reasoningContent: 'private reasoning',
        partial: false,
      },
    ]);
    await restoredRuntime.stop();
  });

  it('emits strictly ordered Streaming snapshots and aggregates weighted Usage across turns', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    await configureProvider(agentRuntime);
    fixture.requests.length = 0;
    const session = await agentRuntime.createSession();
    const events: AgentRuntimeEvent[] = [];
    const unsubscribe = agentRuntime.subscribe((event) => events.push(event));

    fixture.enqueueComplete('first answer', 'first reason', {
      input: 10,
      output: 2,
      hit: 6,
      miss: 4,
    });
    await completeTurn(agentRuntime, session.sessionId, 'first prompt');
    fixture.enqueueComplete('second answer', 'second reason', {
      input: 20,
      output: 4,
      hit: 18,
      miss: 2,
    });
    const completed = await completeTurn(agentRuntime, session.sessionId, 'follow up');

    const sessionEvents = events.filter((event) => event.sessionId === session.sessionId);
    expect(sessionEvents.length).toBeGreaterThanOrEqual(6);
    expect(sessionEvents.map((event) => event.sequence)).toEqual(
      [...sessionEvents].map((event) => event.sequence).sort((left, right) => left - right),
    );
    expect(new Set(sessionEvents.map((event) => event.sequence)).size).toBe(sessionEvents.length);
    const deltaEvents = sessionEvents.filter((event) => event.type === 'assistant-delta');
    expect(deltaEvents.length).toBeGreaterThan(0);
    expect(deltaEvents.every((event) => !('snapshot' in event))).toBe(true);
    expect(deltaEvents.some((event) => event.textDelta === 'first answer')).toBe(true);
    expect(completed.usage).toMatchObject({
      modelCallCount: 2,
      inputTokens: 30,
      outputTokens: 6,
      totalTokens: 36,
      cacheHitInputTokens: 24,
      cacheMissInputTokens: 6,
      cacheHitRate: 0.8,
      cacheMetricsCoverage: 1,
    });
    expect(completed.contextUsage).toMatchObject({
      currentContextTokens: 20,
      contextWindowTokens: 131_072,
      remainingContextTokens: 131_052,
      source: 'provider',
    });
    const secondRequestMessages = fixture.requests[1]?.messages;
    expect(secondRequestMessages).toMatchObject([
      { role: 'user', content: 'first prompt' },
      {
        role: 'assistant',
        content: 'first answer',
        reasoning_content: 'first reason',
      },
      { role: 'user', content: 'follow up' },
    ]);

    unsubscribe();
    await agentRuntime.stop();
  });

  it('cancels after a visible delta and retries without duplicating the user item', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    await configureProvider(agentRuntime);
    fixture.requests.length = 0;
    const session = await agentRuntime.createSession();
    fixture.enqueuePartial('visible partial');
    let resolvePartial!: (event: AgentRuntimeEvent) => void;
    const partial = new Promise<AgentRuntimeEvent>((resolve) => {
      resolvePartial = resolve;
    });
    const unsubscribe = agentRuntime.subscribe((event) => {
      if (event.type === 'assistant-delta' && event.textDelta === 'visible partial') {
        resolvePartial(event);
      }
    });

    const running = await agentRuntime.sendMessage(session.sessionId, 'retry me once');
    await partial;
    const cancelled = await agentRuntime.cancelTurn(running.turnId);
    expect(cancelled.status).toBe('cancelled');

    fixture.enqueueComplete('retry completed', '', {
      input: 7,
      output: 2,
      hit: 0,
      miss: 7,
    });
    const retry = await agentRuntime.retryTurn(running.turnId);
    const completed = await waitForTurn(agentRuntime, session.sessionId, retry.turnId, 'completed');

    expect(completed.items.filter((item) => item.kind === 'user-message')).toHaveLength(1);
    expect(completed.items.filter((item) => item.kind === 'assistant-message')).toMatchObject([
      { content: 'visible partial', partial: true },
      { content: 'retry completed', partial: false },
    ]);
    expect(fixture.requests[1]?.messages).toEqual([
      { role: 'user', content: 'retry me once' },
    ]);

    unsubscribe();
    await agentRuntime.stop();
  });

  it('persists an active Turn as cancelled before Runtime shutdown closes SQLite', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    await configureProvider(agentRuntime);
    fixture.responses.length = 0;
    fixture.enqueuePartial('shutdown partial');
    const session = await agentRuntime.createSession();
    const running = await agentRuntime.sendMessage(session.sessionId, 'shutdown prompt');
    await vi.waitFor(async () => {
      const snapshot = await agentRuntime.getSession(session.sessionId);
      expect(snapshot.items.some((item) => (
        item.kind === 'assistant-message' && item.content === 'shutdown partial'
      ))).toBe(true);
    });

    await agentRuntime.stop();

    const restoredRuntime = fixture.createRuntime();
    await restoredRuntime.start();
    const restored = await restoredRuntime.getSession(session.sessionId);
    expect(restored.turns.find((turn) => turn.turnId === running.turnId)?.status)
      .toBe('cancelled');
    expect(restored.items.find((item) => item.kind === 'assistant-message')).toMatchObject({
      content: 'shutdown partial',
      partial: true,
    });
    await restoredRuntime.stop();
  });

  it('keeps Session events and storage alive while shutdown can still be cancelled', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    await configureProvider(agentRuntime);
    fixture.responses.length = 0;
    fixture.enqueuePartial('shutdown preparation partial');
    const session = await agentRuntime.createSession();
    const events: AgentRuntimeEvent[] = [];
    const unsubscribe = agentRuntime.subscribe((event) => events.push(event));
    await agentRuntime.sendMessage(session.sessionId, 'prepare shutdown');
    await vi.waitFor(() => expect(events.some((event) => event.type === 'assistant-delta')).toBe(true));

    await agentRuntime.beginShutdown();

    expect(events.at(-1)?.type).toBe('session-updated');
    if (events.at(-1)?.type === 'session-updated') {
      expect(events.at(-1)?.snapshot.currentTurn?.status).toBe('cancelled');
    }
    await expect(agentRuntime.createSession())
      .rejects.toThrow('Agent Session service is not accepting commands.');
    agentRuntime.resumeAfterShutdownFailure();
    expect((await agentRuntime.getSession(session.sessionId)).currentTurn?.status)
      .toBe('cancelled');
    await expect(agentRuntime.createSession()).resolves.toMatchObject({
      summary: { title: 'New chat' },
    });

    unsubscribe();
    await agentRuntime.stop();
  });

  it('quarantines a corrupt Session database and starts with an honest empty list', async () => {
    const fixture = await createFixture();
    await writeFile(path.join(fixture.root, 'agent.sqlite'), 'not a sqlite database', 'utf8');
    const agentRuntime = fixture.createRuntime();

    await expect(agentRuntime.start()).resolves.toBeUndefined();
    await expect(agentRuntime.listSessions()).resolves.toEqual({
      currentSessionId: null,
      sessions: [],
    });
    expect((await readdir(fixture.root)).some((name) => name.startsWith('agent.sqlite.corrupt-')))
      .toBe(true);
    await agentRuntime.stop();
  });

  it('preserves the Session database when startup fails for a non-corruption reason', async () => {
    const fixture = await createFixture();
    const firstRuntime = fixture.createRuntime();
    await firstRuntime.start();
    await configureProvider(firstRuntime);
    await firstRuntime.createSession();
    await firstRuntime.stop();
    fixture.secureStore.failOnDecryption = fixture.secureStore.decryptions + 2;
    const unavailableRuntime = fixture.createRuntime();

    await expect(unavailableRuntime.start())
      .rejects.toThrow('temporary secure storage read failure');

    const files = await readdir(fixture.root);
    expect(files).toContain('agent.sqlite');
    expect(files.some((name) => name.startsWith('agent.sqlite.corrupt-'))).toBe(false);
  });

  it('marks a crash-left running Turn failed and retryable on startup', async () => {
    const fixture = await createFixture();
    const session: StoredAgentSession = {
      version: 1,
      sessionId: 'crashed-session',
      title: 'Interrupted chat',
      providerId: 'missing-provider',
      modelId: 'interrupted-model',
      createdAt: 1,
      updatedAt: 2,
      sequence: 2,
      items: [
        { kind: 'user-message', itemId: 'user-crash', turnId: 'turn-crash', content: 'prompt', createdAt: 1 },
        { kind: 'assistant-message', itemId: 'assistant-crash', turnId: 'turn-crash', content: 'partial', reasoningContent: '', partial: true, createdAt: 2 },
      ],
      turns: [{
        turnId: 'turn-crash',
        userItemId: 'user-crash',
        assistantItemId: 'assistant-crash',
        status: 'running',
        retryOfTurnId: null,
        error: null,
        createdAt: 1,
        updatedAt: 2,
      }],
      modelCalls: [],
      contextUsage: {
        contextWindowTokens: 8_192,
        currentContextTokens: null,
        remainingContextTokens: null,
        maxOutputTokens: 1_024,
        source: 'unavailable',
      },
    };
    const sessionStore = new AgentSessionStore(fixture.root, fixture.secureStore);
    sessionStore.start();
    sessionStore.create(session);
    sessionStore.stop();

    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    const restored = await agentRuntime.getSession(session.sessionId);

    expect(restored.currentTurn).toMatchObject({
      status: 'failed',
      error: { code: 'AgentTurnInterrupted' },
    });
    expect(restored.sequence).toBe(3);
    await agentRuntime.stop();
  });

  it('cancels an active Turn and migrates its Session before removing the Provider', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    const firstProviderId = await configureProvider(agentRuntime);
    const secondVerification = await agentRuntime.testProviderConnection({
      providerId: null,
      kind: 'openai-compatible',
      profileName: 'Fallback lab',
      baseUrl: 'http://127.0.0.1:43123/v1',
      modelId: 'fallback-model',
      contextWindowTokens: 65_536,
      maximumOutputTokens: 4_096,
      credential: { action: 'remove' },
    });
    await agentRuntime.saveVerifiedProvider(secondVerification.verificationId);
    fixture.requests.length = 0;
    fixture.responses.length = 0;
    const session = await agentRuntime.createSession();
    fixture.enqueuePartial('provider removal partial');
    const running = await agentRuntime.sendMessage(session.sessionId, 'remove provider while running');
    await vi.waitFor(async () => {
      expect((await agentRuntime.getSession(session.sessionId)).items.some((item) => (
        item.kind === 'assistant-message' && item.content === 'provider removal partial'
      ))).toBe(true);
    });

    const models = await agentRuntime.removeProvider(firstProviderId);
    const restored = await agentRuntime.getSession(session.sessionId);

    expect(restored.turns.find((turn) => turn.turnId === running.turnId)?.status).toBe('cancelled');
    expect(restored.summary).toMatchObject({
      providerId: models.defaultProviderId,
      modelId: 'fallback-model',
    });
    await agentRuntime.stop();
  });

  it('cancels an active Turn when its last Provider is removed without a fallback', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    const providerId = await configureProvider(agentRuntime);
    fixture.requests.length = 0;
    fixture.responses.length = 0;
    const session = await agentRuntime.createSession();
    fixture.enqueuePartial('last provider partial');
    const running = await agentRuntime.sendMessage(session.sessionId, 'remove the last provider');
    await vi.waitFor(async () => {
      expect((await agentRuntime.getSession(session.sessionId)).items.some((item) => (
        item.kind === 'assistant-message' && item.content === 'last provider partial'
      ))).toBe(true);
    });

    const models = await agentRuntime.removeProvider(providerId);
    const snapshot = await agentRuntime.getSession(session.sessionId);

    expect(models.models).toEqual([]);
    expect(snapshot.turns.find((turn) => turn.turnId === running.turnId)?.status)
      .toBe('cancelled');
    await agentRuntime.stop();
  });

  it('coalesces a burst of tiny deltas into a bounded number of encrypted writes', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    await configureProvider(agentRuntime);
    fixture.requests.length = 0;
    fixture.responses.length = 0;
    const session = await agentRuntime.createSession();
    fixture.secureStore.encryptions = 0;
    fixture.responses.push({
      chunks: [
        ...Array.from({ length: 1_000 }, () => sse({ choices: [{ delta: { content: 'x' } }] })),
        sse({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
        'data: [DONE]\n\n',
      ],
    });

    const completed = await completeTurn(agentRuntime, session.sessionId, 'tiny chunks');

    expect(completed.items.find((item) => item.kind === 'assistant-message')).toMatchObject({
      content: 'x'.repeat(1_000),
      partial: false,
    });
    expect(fixture.secureStore.encryptions).toBeLessThan(50);
    await agentRuntime.stop();
  });

  it('persists slow assistant growth as append-only encrypted chunks', async () => {
    const fixture = await createFixture();
    const sessionStore = new AgentSessionStore(fixture.root, fixture.secureStore);
    sessionStore.start();
    const session: StoredAgentSession = {
      version: 1,
      sessionId: 'append-session',
      title: 'Append test',
      providerId: 'provider',
      modelId: 'model',
      createdAt: 1,
      updatedAt: 1,
      sequence: 0,
      items: [{
        kind: 'assistant-message',
        itemId: 'append-item',
        turnId: 'append-turn',
        content: '',
        reasoningContent: '',
        partial: true,
        createdAt: 1,
      }],
      turns: [{
        turnId: 'append-turn',
        userItemId: 'append-user',
        assistantItemId: 'append-item',
        status: 'running',
        retryOfTurnId: null,
        error: null,
        createdAt: 1,
        updatedAt: 1,
      }],
      modelCalls: [],
      contextUsage: {
        contextWindowTokens: 4_000_000,
        currentContextTokens: null,
        remainingContextTokens: null,
        maxOutputTokens: 1_000_000,
        source: 'unavailable',
      },
    };
    sessionStore.create(session);
    try {
      fixture.secureStore.encryptedPlaintextBytes = 0;
      const chunk = 'x'.repeat(64 * 1024);

      for (let index = 0; index < 20; index += 1) {
        sessionStore.appendAssistantDelta({
          sessionId: session.sessionId,
          assistantItemId: 'append-item',
          textDelta: chunk,
          reasoningDelta: '',
          sequence: index + 1,
          updatedAt: index + 2,
        });
      }

      expect(fixture.secureStore.encryptedPlaintextBytes).toBeLessThan(2 * 1024 * 1024);
      expect(sessionStore.get(session.sessionId)?.items[0]).toMatchObject({
        content: chunk.repeat(20),
      });
    } finally {
      sessionStore.stop();
    }
  });

  it('closes SQLite after persistent Streaming writes fail and recovers the Turn on restart', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    await configureProvider(agentRuntime);
    fixture.requests.length = 0;
    fixture.responses.length = 0;
    const session = await agentRuntime.createSession();
    fixture.enqueuePartial('unpersisted partial');
    await agentRuntime.sendMessage(session.sessionId, 'storage failure prompt');
    fixture.secureStore.failEncryption = true;
    await new Promise((resolve) => setTimeout(resolve, 50));

    await expect(agentRuntime.stop()).resolves.toBeUndefined();

    fixture.secureStore.failEncryption = false;
    const restoredRuntime = fixture.createRuntime();
    await restoredRuntime.start();
    const restored = await restoredRuntime.getSession(session.sessionId);
    expect(restored.currentTurn).toMatchObject({
      status: 'failed',
      error: { code: 'AgentTurnInterrupted' },
    });
    await restoredRuntime.stop();
  });

  it('keeps absent Provider Usage unknown instead of reporting exact zero', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    await configureProvider(agentRuntime);
    fixture.requests.length = 0;
    fixture.responses.length = 0;
    const session = await agentRuntime.createSession();
    fixture.responses.push({
      chunks: [
        sse({ choices: [{ delta: { content: 'no usage' } }] }),
        'data: [DONE]\n\n',
      ],
    });

    const completed = await completeTurn(agentRuntime, session.sessionId, 'missing usage');

    expect(completed.usage).toMatchObject({
      modelCallCount: 1,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      cacheHitInputTokens: null,
      cacheMissInputTokens: null,
      cacheHitRate: null,
      cacheMetricsCoverage: null,
    });
    await agentRuntime.stop();
  });

  it('persists each model call Usage and derives Current Context from the latest call', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    await configureProvider(agentRuntime);
    fixture.requests.length = 0;
    fixture.responses.length = 0;
    const session = await agentRuntime.createSession();
    fixture.responses.push(
      {
        chunks: [
          sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'missing-call', function: { name: 'missing', arguments: '{}' } }] } }] }),
          sse({ choices: [], usage: { prompt_tokens: 9, completion_tokens: 1, total_tokens: 10 } }),
          'data: [DONE]\n\n',
        ],
      },
      {
        chunks: [
          sse({ choices: [{ delta: { content: 'finished without usage' } }] }),
          'data: [DONE]\n\n',
        ],
      },
    );

    const completed = await completeTurn(agentRuntime, session.sessionId, 'use two calls');

    expect(completed.usage).toMatchObject({
      modelCallCount: 2,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    });
    expect(completed.contextUsage).toMatchObject({
      currentContextTokens: null,
      source: 'unavailable',
    });
    await agentRuntime.stop();
  });

  it('retains completed model call Usage when a later call in the Turn fails', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    await configureProvider(agentRuntime);
    fixture.requests.length = 0;
    fixture.responses.length = 0;
    const session = await agentRuntime.createSession();
    fixture.responses.push(
      {
        chunks: [
          sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'missing-call', function: { name: 'missing', arguments: '{}' } }] } }] }),
          sse({ choices: [], usage: { prompt_tokens: 9, completion_tokens: 1, total_tokens: 10 } }),
          'data: [DONE]\n\n',
        ],
      },
      { chunks: [], fetchError: new Error('second model call failed') },
    );

    const running = await agentRuntime.sendMessage(session.sessionId, 'fail after one call');
    const failed = await waitForTurn(
      agentRuntime,
      session.sessionId,
      running.turnId,
      'failed',
    );

    expect(failed.usage).toMatchObject({
      modelCallCount: 1,
      inputTokens: 9,
      outputTokens: 1,
      totalTokens: 10,
    });
    expect(failed.contextUsage).toMatchObject({
      currentContextTokens: 9,
      source: 'provider',
    });
    await agentRuntime.stop();
  });

  it('does not delete a Provider when its Session migration cannot be persisted', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    const firstProviderId = await configureProvider(agentRuntime);
    const secondVerification = await agentRuntime.testProviderConnection({
      providerId: null,
      kind: 'openai-compatible',
      profileName: 'Fallback lab',
      baseUrl: 'http://127.0.0.1:43123/v1',
      modelId: 'fallback-model',
      contextWindowTokens: 65_536,
      maximumOutputTokens: 4_096,
      credential: { action: 'remove' },
    });
    await agentRuntime.saveVerifiedProvider(secondVerification.verificationId);
    const session = await agentRuntime.createSession();
    const encryptionBeforeRemove = fixture.secureStore.encryptions;
    fixture.secureStore.failOnEncryption = encryptionBeforeRemove + 1;

    await expect(agentRuntime.removeProvider(firstProviderId))
      .rejects.toThrow('secure storage write failed');

    fixture.secureStore.failOnEncryption = null;
    expect(agentRuntime.getModels().models.map((model) => model.providerId))
      .toContain(firstProviderId);
    expect((await agentRuntime.getSession(session.sessionId)).summary.providerId)
      .toBe(firstProviderId);
    await agentRuntime.stop();
  });

  it('restores Session model binding when Provider removal cannot be persisted', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    const firstProviderId = await configureProvider(agentRuntime);
    const secondVerification = await agentRuntime.testProviderConnection({
      providerId: null,
      kind: 'openai-compatible',
      profileName: 'Fallback lab',
      baseUrl: 'http://127.0.0.1:43123/v1',
      modelId: 'fallback-model',
      contextWindowTokens: 65_536,
      maximumOutputTokens: 4_096,
      credential: { action: 'remove' },
    });
    await agentRuntime.saveVerifiedProvider(secondVerification.verificationId);
    const session = await agentRuntime.createSession();
    const encryptionBeforeRemove = fixture.secureStore.encryptions;
    fixture.secureStore.failOnEncryption = encryptionBeforeRemove + 2;

    await expect(agentRuntime.removeProvider(firstProviderId))
      .rejects.toThrow('secure storage write failed');

    fixture.secureStore.failOnEncryption = null;
    expect(agentRuntime.getModels().models.map((model) => model.providerId))
      .toContain(firstProviderId);
    expect((await agentRuntime.getSession(session.sessionId)).summary.providerId)
      .toBe(firstProviderId);
    await agentRuntime.stop();
  });

  it('preserves concurrent Session mutations while another Turn is cancelled for Provider removal', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    const firstProviderId = await configureProvider(agentRuntime);
    const fallbackVerification = await agentRuntime.testProviderConnection({
      providerId: null,
      kind: 'openai-compatible',
      profileName: 'Fallback lab',
      baseUrl: 'http://127.0.0.1:43123/v1',
      modelId: 'fallback-model',
      contextWindowTokens: 65_536,
      maximumOutputTokens: 4_096,
      credential: { action: 'remove' },
    });
    await agentRuntime.saveVerifiedProvider(fallbackVerification.verificationId);
    const firstSession = await agentRuntime.createSession();
    const activeSession = await agentRuntime.createSession();
    fixture.requests.length = 0;
    fixture.responses.length = 0;
    let releaseAbort!: () => void;
    let reportAbort!: () => void;
    const abortGate = new Promise<void>((resolve) => {
      releaseAbort = resolve;
    });
    const abortObserved = new Promise<void>((resolve) => {
      reportAbort = resolve;
    });
    fixture.responses.push({
      chunks: [sse({ choices: [{ delta: { content: 'pending removal' } }] })],
      waitForAbort: true,
      abortGate,
      onAbort: reportAbort,
    });
    const running = await agentRuntime.sendMessage(activeSession.sessionId, 'keep removal pending');
    await vi.waitFor(async () => {
      expect((await agentRuntime.getSession(activeSession.sessionId)).items.some((item) => (
        item.kind === 'assistant-message' && item.content === 'pending removal'
      ))).toBe(true);
    });

    const removal = agentRuntime.removeProvider(firstProviderId);
    await abortObserved;
    try {
      await agentRuntime.renameSession(firstSession.sessionId, 'Renamed during removal');
    } finally {
      releaseAbort();
    }
    await removal;

    const firstRestored = await agentRuntime.getSession(firstSession.sessionId);
    expect(firstRestored.summary.title).toBe('Renamed during removal');
    expect(firstRestored.sequence).toBe(2);
    expect((await agentRuntime.getSession(activeSession.sessionId)).turns.find(
      (turn) => turn.turnId === running.turnId,
    )?.status).toBe('cancelled');
    await agentRuntime.stop();
  });

  it('restores a saved Provider when its Session metadata cannot be reconciled', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    const providerId = await configureProvider(agentRuntime);
    const session = await agentRuntime.createSession();
    const verification = await agentRuntime.testProviderConnection({
      providerId,
      kind: 'openai-compatible',
      profileName: 'Session lab edited',
      baseUrl: 'http://127.0.0.1:43123/v1',
      modelId: 'edited-model',
      contextWindowTokens: 65_536,
      maximumOutputTokens: 4_096,
      credential: { action: 'remove' },
    });
    const encryptionBeforeSave = fixture.secureStore.encryptions;
    fixture.secureStore.failOnEncryption = encryptionBeforeSave + 2;

    await expect(agentRuntime.saveVerifiedProvider(verification.verificationId))
      .rejects.toThrow('secure storage write failed');

    fixture.secureStore.failOnEncryption = null;
    expect(agentRuntime.getModels().models.find((model) => model.providerId === providerId))
      .toMatchObject({ modelId: 'session-model', contextWindowTokens: 131_072 });
    expect((await agentRuntime.getSession(session.sessionId)).summary.modelId)
      .toBe('session-model');
    await agentRuntime.stop();
  });

  it('truncates the WAL after deleting a Session', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    await configureProvider(agentRuntime);
    const session = await agentRuntime.createSession();

    await agentRuntime.deleteSession(session.sessionId);

    const walPath = path.join(fixture.root, 'agent.sqlite-wal');
    const walBytes = await stat(walPath).then((value) => value.size, () => 0);
    expect(walBytes).toBe(0);
    await agentRuntime.stop();
  });

  it('bounds max_tokens by the conservatively estimated remaining Context Window', async () => {
    const fixture = await createFixture();
    const agentRuntime = fixture.createRuntime();
    await agentRuntime.start();
    const verification = await agentRuntime.testProviderConnection({
      providerId: null,
      kind: 'openai-compatible',
      profileName: 'Small context',
      baseUrl: 'http://127.0.0.1:43123/v1',
      modelId: 'small-context-model',
      contextWindowTokens: 128,
      maximumOutputTokens: 100,
      credential: { action: 'remove' },
    });
    await agentRuntime.saveVerifiedProvider(verification.verificationId);
    fixture.requests.length = 0;
    fixture.responses.length = 0;
    const session = await agentRuntime.createSession();
    fixture.enqueueComplete('bounded', '', {
      input: 10,
      output: 2,
      hit: 0,
      miss: 10,
    });

    await completeTurn(agentRuntime, session.sessionId, 'x'.repeat(20));

    expect(fixture.requests[0]?.max_tokens).toBe(44);
    const beforeRejected = await agentRuntime.getSession(session.sessionId);
    await expect(agentRuntime.sendMessage(session.sessionId, 'y'.repeat(200)))
      .rejects.toThrow('Agent message exceeds the model Context Window.');
    const afterRejected = await agentRuntime.getSession(session.sessionId);
    expect(afterRejected.items).toEqual(beforeRejected.items);
    await agentRuntime.stop();
  });
});

async function createFixture(): Promise<SessionFixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'interceptor-agent-session-'));
  roots.push(root);
  const fixture = new SessionFixture(root);
  fixtures.push(fixture);
  return fixture;
}

async function configureProvider(agentRuntime: AgentRuntime): Promise<string> {
  const draft: AgentProviderDraft = {
    providerId: null,
    kind: 'openai-compatible',
    profileName: 'Session lab',
    baseUrl: 'http://127.0.0.1:43123/v1',
    modelId: 'session-model',
    contextWindowTokens: 131_072,
    maximumOutputTokens: 8_192,
    credential: { action: 'remove' },
  };
  const verification = await agentRuntime.testProviderConnection(draft);
  const models = await agentRuntime.saveVerifiedProvider(verification.verificationId);
  return models.defaultProviderId!;
}

async function completeTurn(
  agentRuntime: AgentRuntime,
  sessionId: string,
  content: string,
): Promise<AgentSessionSnapshot> {
  const running = await agentRuntime.sendMessage(sessionId, content);
  return waitForTurn(agentRuntime, sessionId, running.turnId, 'completed');
}

async function waitForTurn(
  agentRuntime: AgentRuntime,
  sessionId: string,
  turnId: string,
  status: 'completed' | 'cancelled' | 'failed',
): Promise<AgentSessionSnapshot> {
  let snapshot = await agentRuntime.getSession(sessionId);
  await vi.waitFor(async () => {
    snapshot = await agentRuntime.getSession(sessionId);
    expect(snapshot.turns.find((turn) => turn.turnId === turnId)?.status).toBe(status);
  });
  return snapshot;
}

function sse(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}
