import type { ClientHttp2Stream } from 'node:http2';

/** Payload defined by Node's public http2.client.stream.created channel. */
export interface Http2ClientStreamCreatedMessage {
  readonly stream: ClientHttp2Stream;
}

export interface ObservedHttp2Session {
  transportEnded: boolean;
  readonly streams: Map<ClientHttp2Stream, ObservedHttp2Stream>;
  readonly removeListeners: () => void;
}

export interface ObservedHttp2Stream {
  responseReceived: boolean;
  drainCheck: NodeJS.Immediate | undefined;
  readonly removeListeners: () => void;
}
