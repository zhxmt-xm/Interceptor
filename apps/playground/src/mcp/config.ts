export interface PlaygroundMcpConfiguration {
  readonly endpoint: string;
  readonly token: string;
}

const INVALID_CONFIGURATION_MESSAGE = 'Invalid Interceptor MCP configuration.';

export function parseMcpConfiguration(text: string): PlaygroundMcpConfiguration {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(INVALID_CONFIGURATION_MESSAGE);
  }
  if (!isRecord(value) || !isRecord(value.servers)) {
    throw new Error(INVALID_CONFIGURATION_MESSAGE);
  }
  const interceptor = value.servers.interceptor;
  if (
    !isRecord(interceptor)
    || interceptor.type !== 'http'
    || typeof interceptor.url !== 'string'
    || !isRecord(interceptor.headers)
    || typeof interceptor.headers.Authorization !== 'string'
  ) {
    throw new Error(INVALID_CONFIGURATION_MESSAGE);
  }
  const endpoint = parseEndpoint(interceptor.url);
  const authorization = interceptor.headers.Authorization;
  if (!authorization.startsWith('Bearer ') || authorization.length === 'Bearer '.length) {
    throw new Error(INVALID_CONFIGURATION_MESSAGE);
  }
  const token = authorization.slice('Bearer '.length);
  if (/\s/.test(token)) throw new Error(INVALID_CONFIGURATION_MESSAGE);
  return { endpoint, token };
}

function parseEndpoint(value: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error(INVALID_CONFIGURATION_MESSAGE);
  }
  if (
    endpoint.protocol !== 'http:'
    || endpoint.hostname !== '127.0.0.1'
    || endpoint.port.length === 0
    || endpoint.pathname !== '/mcp'
    || endpoint.username.length > 0
    || endpoint.password.length > 0
    || endpoint.search.length > 0
    || endpoint.hash.length > 0
  ) {
    throw new Error(INVALID_CONFIGURATION_MESSAGE);
  }
  return endpoint.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}