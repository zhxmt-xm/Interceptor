import { channel } from 'node:diagnostics_channel';
import type { ClientHttp2Stream, Http2Session } from 'node:http2';
import { TLSSocket } from 'node:tls';

import type { CoreDiagnostics } from '../core-diagnostics';
import type {
  Http2ClientStreamCreatedMessage,
  ObservedHttp2Session,
  ObservedHttp2Stream,
} from './interfaces';
import { H2UpstreamIncompleteError } from './internal/errors';

/** Preserve unread TLS/H2 response buffers until their Core consumer drains them. */
export class Http2ClientService {
  /** Node's public creation channel covers both Mockttp and Composer clients. */
  private readonly createdChannel = channel('http2.client.stream.created');
  /** Sessions owned by this Core generation, released on session close or stop. */
  private readonly sessionsByClient = new Map<Http2Session, ObservedHttp2Session>();
  /** Whether this Core generation currently observes outgoing client streams. */
  private observing = false;
  /** Stable callback identity for the process-wide Node subscription. */
  private readonly observeClientStream = (message: unknown): void => {
    const { stream } = message as Http2ClientStreamCreatedMessage;
    const session = stream.session;
    if (!session || session.destroyed || stream.destroyed) return;
    let observedSession = this.sessionsByClient.get(session);
    if (!observedSession) {
      const socket = session.socket;
      if (!(socket instanceof TLSSocket)) return;
      observedSession = this.observeSession(session, socket);
    }
    this.observeStream(observedSession, stream);
  };

  /** Use Core's existing diagnostics sink without logging URLs or request content. */
  constructor(private readonly coreDiagnostics: CoreDiagnostics) {}

  /** Observe only clients created while this Core application is running. */
  start(): void {
    if (this.observing) return;
    this.observing = true;
    this.createdChannel.subscribe(this.observeClientStream);
  }

  /** Remove all listeners/checks and await closure of this generation's sessions. */
  async stop(): Promise<void> {
    this.observing = false;
    this.createdChannel.unsubscribe(this.observeClientStream);
    const sessionClosures: Promise<void>[] = [];
    for (const [session, observedSession] of this.sessionsByClient) {
      sessionClosures.push(new Promise<void>((resolve) => session.once('close', resolve)));
      this.releaseSession(session, observedSession);
      session.destroy();
    }
    await Promise.all(sessionClosures);
  }

  /** Keep TLS writable until HTTP/2 has consumed every existing response. */
  private observeSession(session: Http2Session, socket: TLSSocket): ObservedHttp2Session {
    // The public socket proxy becomes unbound before the session's close event.
    const removeSocketListener = socket.off;
    const onTransportEnd = (): void => {
      observedSession.transportEnded = true;
      session.close();
      for (const [stream, observedStream] of observedSession.streams) {
        this.scheduleDrainCheck(observedSession, stream, observedStream);
      }
    };
    const onSessionClose = (): void => this.releaseSession(session, observedSession);
    const observedSession: ObservedHttp2Session = {
      transportEnded: socket.readableEnded,
      streams: new Map(),
      removeListeners: () => {
        removeSocketListener('end', onTransportEnd);
        session.off('close', onSessionClose);
      },
    };
    this.sessionsByClient.set(session, observedSession);
    socket.allowHalfOpen = true;
    socket.once('end', onTransportEnd);
    session.once('close', onSessionClose);
    return observedSession;
  }

  /** Observe headers and consumer resume without reading or buffering body data. */
  private observeStream(observedSession: ObservedHttp2Session, stream: ClientHttp2Stream): void {
    const onResponse = (): void => { observedStream.responseReceived = true; };
    const onResume = (): void => this.scheduleDrainCheck(observedSession, stream, observedStream);
    const onClose = (): void => {
      observedSession.streams.delete(stream);
      observedStream.removeListeners();
    };
    const observedStream: ObservedHttp2Stream = {
      responseReceived: false,
      drainCheck: undefined,
      removeListeners: () => {
        if (observedStream.drainCheck) clearImmediate(observedStream.drainCheck);
        stream.off('response', onResponse);
        stream.off('resume', onResume);
        stream.off('close', onClose);
      },
    };
    observedSession.streams.set(stream, observedStream);
    stream.once('response', onResponse);
    stream.on('resume', onResume);
    stream.once('close', onClose);
    this.scheduleDrainCheck(observedSession, stream, observedStream);
  }

  /** Let buffered DATA/END_STREAM callbacks run before deciding EOF was premature. */
  private scheduleDrainCheck(
    observedSession: ObservedHttp2Session,
    stream: ClientHttp2Stream,
    observedStream: ObservedHttp2Stream,
  ): void {
    if (!observedSession.transportEnded || observedStream.drainCheck) return;
    observedStream.drainCheck = setImmediate(() => {
      observedStream.drainCheck = undefined;
      if (stream.closed || stream.destroyed || stream.readableEnded || stream.readableLength !== 0) return;
      if (observedStream.responseReceived && stream.readableFlowing !== true) return;
      const error = new H2UpstreamIncompleteError();
      this.coreDiagnostics.warn('http2.response-incomplete', { outcome: 'failed', errorCode: error.code });
      stream.destroy(error);
    });
  }

  /** Release only this service's observers; protocol and consumer listeners remain intact. */
  private releaseSession(session: Http2Session, observedSession: ObservedHttp2Session): void {
    this.sessionsByClient.delete(session);
    observedSession.removeListeners();
    for (const observedStream of observedSession.streams.values()) observedStream.removeListeners();
    observedSession.streams.clear();
  }
}
