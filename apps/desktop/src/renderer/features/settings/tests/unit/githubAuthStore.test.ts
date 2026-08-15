import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GitHubAuthStatus, InterceptorDesktopApi } from '../../../../../shared/desktop-api';
import { GitHubAuthActions, useGitHubAuthStore } from '../../data/githubAuthStore';

const signedOut: GitHubAuthStatus = {
  state: 'signed-out',
  login: null,
  userCode: null,
  verificationUri: null,
  expiresAt: null,
  message: 'Sign in with GitHub to access private releases.',
};

const signedIn: GitHubAuthStatus = {
  state: 'signed-in',
  login: 'zhxmt-xm',
  userCode: null,
  verificationUri: null,
  expiresAt: null,
  message: 'GitHub authorization is stored securely on this device.',
};

afterEach(() => {
  vi.unstubAllGlobals();
  useGitHubAuthStore.setState({ status: null, busy: false, error: null });
});

describe('GitHubAuthActions', () => {
  it('loads the initial public state and applies background authorization events', async () => {
    let listener: (status: GitHubAuthStatus) => void = () => undefined;
    const unsubscribe = vi.fn();
    const interceptor = {
      getGitHubAuthStatus: vi.fn(async () => signedOut),
      onGitHubAuthStatusChange: vi.fn((nextListener) => {
        listener = nextListener;
        return unsubscribe;
      }),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });

    const stop = GitHubAuthActions.subscribe();
    await vi.waitFor(() => {
      expect(useGitHubAuthStore.getState().status).toEqual(signedOut);
    });

    listener(signedIn);
    expect(useGitHubAuthStore.getState().status).toEqual(signedIn);

    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('merges the authorizing state returned by the sign-in intent', async () => {
    const authorizing: GitHubAuthStatus = {
      state: 'authorizing',
      login: null,
      userCode: 'F7D2-9A4C',
      verificationUri: 'https://github.com/login/device',
      expiresAt: '2026-08-07T00:15:00.000Z',
      message: 'Enter the one-time code in GitHub to authorize this device.',
    };
    const interceptor = {
      signInWithGitHub: vi.fn(async () => authorizing),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });

    await GitHubAuthActions.signIn();

    expect(useGitHubAuthStore.getState()).toMatchObject({
      status: authorizing,
      busy: false,
      error: null,
    });
  });
});
