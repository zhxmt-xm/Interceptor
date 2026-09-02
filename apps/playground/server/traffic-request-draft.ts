import type { TrafficRequestDraft } from './interfaces.ts';

export function parseTrafficRequestDraft(value: unknown): TrafficRequestDraft {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('draft is required.');
  }
  const draft = value as Readonly<Record<string, unknown>>;
  if (draft.kind === 'http') {
    const protocol = draft.protocol;
    if (protocol !== 'h1' && protocol !== 'h2') throw new Error('draft.protocol must be h1 or h2.');
    return {
      body: stringValue(draft.body, 'draft.body'),
      headers: stringRecord(draft.headers, 'draft.headers'),
      kind: 'http',
      method: requiredString(draft.method, 'draft.method'),
      path: requiredString(draft.path, 'draft.path'),
      protocol,
    };
  }
  if (draft.kind === 'websocket') {
    return {
      clientMessages: messageDrafts(draft.clientMessages, 'draft.clientMessages'),
      controls: controlDrafts(draft.controls),
      headers: stringRecord(draft.headers, 'draft.headers'),
      kind: 'websocket',
      path: requiredString(draft.path, 'draft.path'),
      serverMessages: messageDrafts(draft.serverMessages, 'draft.serverMessages'),
    };
  }
  if (draft.kind === 'grpc') {
    const framing = draft.framing;
    if (framing !== 'truncated' && framing !== 'valid') {
      throw new Error('draft.framing must be truncated or valid.');
    }
    return {
      framing,
      headers: stringRecord(draft.headers, 'draft.headers'),
      kind: 'grpc',
      path: requiredString(draft.path, 'draft.path'),
      requestMessages: grpcMessageDrafts(draft.requestMessages, 'draft.requestMessages'),
      responseMessages: grpcMessageDrafts(draft.responseMessages, 'draft.responseMessages'),
      responseTrailers: stringRecord(draft.responseTrailers, 'draft.responseTrailers'),
    };
  }
  if (draft.kind === 'tls') {
    const mode = draft.mode;
    if (mode !== 'https-h1' && mode !== 'https-h2' && mode !== 'tunnel-only') {
      throw new Error('draft.mode must be https-h1, https-h2, or tunnel-only.');
    }
    return {
      connectHeaders: stringRecord(draft.connectHeaders, 'draft.connectHeaders'),
      headers: stringRecord(draft.headers, 'draft.headers'),
      kind: 'tls',
      method: requiredString(draft.method, 'draft.method'),
      mode,
      path: requiredString(draft.path, 'draft.path'),
      targetHost: requiredString(draft.targetHost, 'draft.targetHost'),
    };
  }
  throw new Error('draft.kind must be http, websocket, grpc, or tls.');
}

function controlDrafts(value: unknown): readonly ('close' | 'ping' | 'pong')[] {
  if (!Array.isArray(value)) throw new Error('draft.controls must be an array.');
  return value.map((control) => {
    if (control !== 'close' && control !== 'ping' && control !== 'pong') {
      throw new Error('draft.controls contains an unsupported control frame.');
    }
    return control;
  });
}

function grpcMessageDrafts(
  value: unknown,
  name: string,
): Extract<TrafficRequestDraft, { kind: 'grpc' }>['requestMessages'] {
  return messageDrafts(value, name).map((message, index) => {
    const source = (value as readonly unknown[])[index] as Readonly<Record<string, unknown>>;
    if (typeof source.compressed !== 'boolean') throw new Error(`${name}[${index}].compressed must be a boolean.`);
    return { ...message, compressed: source.compressed };
  });
}

function messageDrafts(
  value: unknown,
  name: string,
): Extract<TrafficRequestDraft, { kind: 'websocket' }>['clientMessages'] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`);
  return value.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`${name}[${index}] must be an object.`);
    }
    const message = item as Readonly<Record<string, unknown>>;
    if (message.encoding !== 'base64' && message.encoding !== 'utf8') {
      throw new Error(`${name}[${index}].encoding must be base64 or utf8.`);
    }
    return {
      data: stringValue(message.data, `${name}[${index}].data`),
      encoding: message.encoding,
    };
  });
}

function requiredString(value: unknown, name: string): string {
  const result = stringValue(value, name);
  if (result.length === 0) throw new Error(`${name} is required.`);
  return result;
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(`${name} must be a string.`);
  return value;
}

function stringRecord(value: unknown, name: string): Readonly<Record<string, string>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
  return Object.fromEntries(Object.entries(value).map(([key, recordValue]) => {
    if (typeof recordValue !== 'string') throw new Error(`${name}.${key} must be a string.`);
    return [key, recordValue];
  }));
}
