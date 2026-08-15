import { describe, expect, it } from 'vitest';

import { McpTokenAuthenticator } from '../../auth/entry';

describe('McpTokenAuthenticator', () => {
  it('issues a distinct token per registration', () => {
    const mcpTokenAuthenticator = new McpTokenAuthenticator();

    const first = mcpTokenAuthenticator.register('VS Code');
    const second = mcpTokenAuthenticator.register('Claude Desktop');

    expect(first.token).not.toBe(second.token);
    expect(first.clientId).not.toBe(second.clientId);
  });

  it('resolves a valid token to its trusted identity', () => {
    const mcpTokenAuthenticator = new McpTokenAuthenticator();
    const registration = mcpTokenAuthenticator.register('VS Code');

    const identity = mcpTokenAuthenticator.authenticate(registration.token, 'self-reported');

    expect(identity).toEqual({
      clientId: registration.clientId,
      label: 'VS Code',
      reportedName: 'self-reported',
    });
  });

  it('rejects unknown and empty tokens', () => {
    const mcpTokenAuthenticator = new McpTokenAuthenticator();
    mcpTokenAuthenticator.register('VS Code');

    expect(mcpTokenAuthenticator.authenticate('wrong')).toBeNull();
    expect(mcpTokenAuthenticator.authenticate('')).toBeNull();
  });

  it('invalidates a revoked client immediately', () => {
    const mcpTokenAuthenticator = new McpTokenAuthenticator();
    const registration = mcpTokenAuthenticator.register('VS Code');

    expect(mcpTokenAuthenticator.revoke(registration.clientId)).toBe(true);

    expect(mcpTokenAuthenticator.authenticate(registration.token)).toBeNull();
  });

  it('never exposes tokens through the listing', () => {
    const mcpTokenAuthenticator = new McpTokenAuthenticator();
    mcpTokenAuthenticator.register('VS Code');

    expect(mcpTokenAuthenticator.list()).toEqual([
      { clientId: expect.any(String), label: 'VS Code' },
    ]);
  });

  it('invalidates every client on clear', () => {
    const mcpTokenAuthenticator = new McpTokenAuthenticator();
    const registration = mcpTokenAuthenticator.register('VS Code');

    mcpTokenAuthenticator.clear();

    expect(mcpTokenAuthenticator.authenticate(registration.token)).toBeNull();
    expect(mcpTokenAuthenticator.list()).toEqual([]);
  });
});
