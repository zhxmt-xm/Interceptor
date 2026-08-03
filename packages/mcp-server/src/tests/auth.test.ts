import { describe, expect, it } from 'vitest';

import { McpTokenAuthenticator } from '../auth/entry';

describe('McpTokenAuthenticator', () => {
  it('issues a distinct token per registration', () => {
    const authenticator = new McpTokenAuthenticator();

    const first = authenticator.register('VS Code');
    const second = authenticator.register('Claude Desktop');

    expect(first.token).not.toBe(second.token);
    expect(first.clientId).not.toBe(second.clientId);
  });

  it('resolves a valid token to its trusted identity', () => {
    const authenticator = new McpTokenAuthenticator();
    const registration = authenticator.register('VS Code');

    const identity = authenticator.authenticate(registration.token, 'self-reported');

    expect(identity).toEqual({
      clientId: registration.clientId,
      label: 'VS Code',
      reportedName: 'self-reported',
    });
  });

  it('rejects unknown and empty tokens', () => {
    const authenticator = new McpTokenAuthenticator();
    authenticator.register('VS Code');

    expect(authenticator.authenticate('wrong')).toBeNull();
    expect(authenticator.authenticate('')).toBeNull();
  });

  it('invalidates a revoked client immediately', () => {
    const authenticator = new McpTokenAuthenticator();
    const registration = authenticator.register('VS Code');

    expect(authenticator.revoke(registration.clientId)).toBe(true);

    expect(authenticator.authenticate(registration.token)).toBeNull();
  });

  it('never exposes tokens through the listing', () => {
    const authenticator = new McpTokenAuthenticator();
    authenticator.register('VS Code');

    expect(authenticator.list()).toEqual([
      { clientId: expect.any(String), label: 'VS Code' },
    ]);
  });

  it('invalidates every client on clear', () => {
    const authenticator = new McpTokenAuthenticator();
    const registration = authenticator.register('VS Code');

    authenticator.clear();

    expect(authenticator.authenticate(registration.token)).toBeNull();
    expect(authenticator.list()).toEqual([]);
  });
});
