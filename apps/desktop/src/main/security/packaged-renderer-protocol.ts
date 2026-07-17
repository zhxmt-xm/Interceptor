import { net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Serves packaged Renderer assets from one secure standard app origin. */
export class PackagedRendererProtocol {
  /** Private scheme registered before Electron becomes ready. */
  static readonly scheme = 'interceptor';
  /** Fixed authority used by the packaged application window. */
  static readonly authority = 'app';
  /** Stable production entry URL accepted by navigation and IPC checks. */
  static readonly entryUrl = 'interceptor://app/index.html';
  /** Absolute root containing only the packaged Renderer output. */
  private readonly rendererRoot: string;

  /** Bind protocol file resolution to one packaged Renderer directory. */
  constructor(rendererRoot: string) {
    this.rendererRoot = path.resolve(rendererRoot);
  }

  /** Register secure standard-scheme privileges before app readiness. */
  static registerScheme(): void {
    protocol.registerSchemesAsPrivileged([
      {
        scheme: this.scheme,
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          stream: true,
          codeCache: true,
        },
      },
    ]);
  }

  /** Install the default-session handler after Electron becomes ready. */
  install(): void {
    if (protocol.isProtocolHandled(PackagedRendererProtocol.scheme)) {
      throw new Error('Packaged Renderer protocol is already installed.');
    }
    protocol.handle(
      PackagedRendererProtocol.scheme,
      (request) => this.handleRequest(request),
    );
  }

  /** Resolve one GET request inside the Renderer root and stream it through net.fetch. */
  private async handleRequest(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    let candidate: URL;
    try {
      candidate = new URL(request.url);
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
    if (
      candidate.protocol !== `${PackagedRendererProtocol.scheme}:` ||
      candidate.hostname !== PackagedRendererProtocol.authority
    ) {
      return new Response('Not Found', { status: 404 });
    }

    let relativePath: string;
    try {
      relativePath = decodeURIComponent(candidate.pathname).replace(/^\/+/, '');
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
    const targetPath = path.resolve(
      this.rendererRoot,
      relativePath || 'index.html',
    );
    const relation = path.relative(this.rendererRoot, targetPath);
    if (
      relation === '..' ||
      relation.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relation)
    ) {
      return new Response('Not Found', { status: 404 });
    }
    return net.fetch(pathToFileURL(targetPath).toString(), {
      bypassCustomProtocolHandlers: true,
    });
  }
}