import { describe, expect, it } from 'vitest';

import type { McpClientRegistration } from '../../interfaces';
import { McpTokenAuthenticator } from '../../auth/entry';

const REGISTRATION: McpClientRegistration = {
  clientId: 'f3072bcf-91b7-48be-a38f-33097b574495',
  label: 'VS Code',
  token: 'persistent-token-value-that-does-not-change-on-restart',
};

describe('McpTokenAuthenticator', () => {
  it('resolves a valid token to its trusted identity', () => {
    const mcpTokenAuthenticator = new McpTokenAuthenticator();
    mcpTokenAuthenticator.restore([REGISTRATION]);

    const identity = mcpTokenAuthenticator.authenticate(REGISTRATION.token);

    expect(identity).toEqual({
      clientId: REGISTRATION.clientId,
      label: 'VS Code',
    });
  });

  it('rejects unknown and empty tokens', () => {
    const mcpTokenAuthenticator = new McpTokenAuthenticator();
    mcpTokenAuthenticator.restore([REGISTRATION]);

    expect(mcpTokenAuthenticator.authenticate('wrong')).toBeNull();
    expect(mcpTokenAuthenticator.authenticate('')).toBeNull();
  });

  it('replaces the complete active credential set', () => {
    const mcpTokenAuthenticator = new McpTokenAuthenticator();
    mcpTokenAuthenticator.restore([REGISTRATION]);

    mcpTokenAuthenticator.restore([]);

    expect(mcpTokenAuthenticator.authenticate(REGISTRATION.token)).toBeNull();
  });

  it('never exposes tokens through the listing', () => {
    const mcpTokenAuthenticator = new McpTokenAuthenticator();
    mcpTokenAuthenticator.restore([REGISTRATION]);

    expect(mcpTokenAuthenticator.list()).toEqual([
      { clientId: expect.any(String), label: 'VS Code' },
    ]);
  });

  it('invalidates every client on clear', () => {
    const mcpTokenAuthenticator = new McpTokenAuthenticator();
    mcpTokenAuthenticator.restore([REGISTRATION]);

    mcpTokenAuthenticator.clear();

    expect(mcpTokenAuthenticator.authenticate(REGISTRATION.token)).toBeNull();
    expect(mcpTokenAuthenticator.list()).toEqual([]);
  });

  it('restores an existing client token without rotating it', () => {
    const mcpTokenAuthenticator = new McpTokenAuthenticator();

    mcpTokenAuthenticator.restore([REGISTRATION]);

    expect(mcpTokenAuthenticator.authenticate(REGISTRATION.token)).toEqual({
      clientId: REGISTRATION.clientId,
      label: REGISTRATION.label,
    });
    expect(mcpTokenAuthenticator.list()).toEqual([{
      clientId: REGISTRATION.clientId,
      label: REGISTRATION.label,
    }]);
  });

  it('rejects duplicate restored client ids and tokens', () => {
    const duplicateId = '3b81e035-e3c6-4e73-8db4-7ce9c6646b9f';
    const token = 'persistent-token-value-that-does-not-change-on-restart';

    expect(() => new McpTokenAuthenticator().restore([
      { clientId: duplicateId, label: 'VS Code', token },
      { clientId: duplicateId, label: 'Cursor', token: `${token}-other` },
    ])).toThrow(/duplicate client id/i);
    expect(() => new McpTokenAuthenticator().restore([
      { clientId: duplicateId, label: 'VS Code', token },
      { clientId: 'a7d44d75-4c67-4a29-a96e-d60363de3d72', label: 'Cursor', token },
    ])).toThrow(/duplicate token/i);
  });
});
