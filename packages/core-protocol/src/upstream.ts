export type UpstreamProxyProtocol = 'http' | 'https' | 'socks5';

export type UpstreamProxySettings =
  | { readonly mode: 'system' }
  | { readonly mode: 'direct' }
  | {
    readonly mode: 'manual';
    readonly protocol: UpstreamProxyProtocol;
    readonly host: string;
    readonly port: number;
  }
  | { readonly mode: 'pac'; readonly url: string }
  | { readonly mode: 'wpad' };

function invalid(detail: string): never {
  throw new TypeError(`Invalid upstream settings: ${detail}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireFields(value: Record<string, unknown>, fields: readonly string[]): void {
  if (Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field))) {
    invalid('unexpected or missing fields.');
  }
}

/** Validate the user's selected mode without accepting hidden routing or credential fields. */
export function parseUpstreamProxySettings(value: unknown): UpstreamProxySettings {
  if (!isRecord(value)) invalid('expected an object.');
  switch (value.mode) {
    case 'system':
    case 'direct':
    case 'wpad':
      requireFields(value, ['mode']);
      return { mode: value.mode };
    case 'manual': {
      requireFields(value, ['mode', 'protocol', 'host', 'port']);
      if (value.protocol !== 'http' && value.protocol !== 'https' && value.protocol !== 'socks5') {
        invalid('unsupported proxy protocol.');
      }
      if (typeof value.host !== 'string' || !value.host.trim() || /[\s/@?#\\]/.test(value.host.trim())) {
        invalid('enter a proxy host without a URL scheme, path or credentials.');
      }
      if (typeof value.port !== 'number' || !Number.isInteger(value.port) || value.port < 1 || value.port > 65_535) {
        invalid('port must be an integer between 1 and 65535.');
      }
      let host = value.host.trim();
      try {
        const authority = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
        const parsed = new URL(`http://${authority}:${value.port}`);
        host = parsed.hostname.replace(/^\[|\]$/g, '');
      } catch {
        invalid('proxy host is not a valid host name or IP address.');
      }
      if (host.length > 253) invalid('proxy host is too long.');
      return { mode: 'manual', protocol: value.protocol, host, port: value.port };
    }
    case 'pac': {
      requireFields(value, ['mode', 'url']);
      if (typeof value.url !== 'string') invalid('PAC URL must be a string.');
      let url: URL;
      try { url = new URL(value.url.trim()); }
      catch { invalid('PAC URL must be an absolute HTTP or HTTPS URL.'); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
        invalid('PAC URL must use HTTP or HTTPS without credentials or a fragment.');
      }
      return { mode: 'pac', url: url.href };
    }
    default: return invalid('unknown mode.');
  }
}
