export interface McpExchangeText {
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}

export function redactMcpExchange(
  exchange: McpExchangeText,
  token: string,
): McpExchangeText {
  return {
    body: redactSensitiveText(exchange.body, token),
    headers: Object.fromEntries(Object.entries(exchange.headers).map(([name, value]) => [
      name,
      name.toLowerCase() === 'authorization'
        ? 'Bearer <redacted>'
        : redactSensitiveText(value, token),
    ])),
  };
}

export function redactSensitiveText(value: string, token: string): string {
  const withoutKnownToken = token.length === 0 ? value : value.replaceAll(token, '<redacted>');
  return withoutKnownToken.replace(/Bearer\s+[^\s"']+/gi, 'Bearer <redacted>');
}