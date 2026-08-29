import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AgentModelsSnapshot,
  AgentProviderDraft,
  AgentProviderVerification,
  InterceptorDesktopApi,
} from '../../../../../shared/desktop-api';
import { AgentModelsActions, useAgentModelsStore } from '../../data/agentModelsStore';

const emptySnapshot: AgentModelsSnapshot = {
  defaultProviderId: null,
  models: [],
};

const configuredSnapshot: AgentModelsSnapshot = {
  defaultProviderId: 'provider-1',
  models: [{
    providerId: 'provider-1',
    kind: 'openai-compatible',
    profileName: 'Local lab',
    baseUrl: 'http://127.0.0.1:43123/v1',
    modelId: 'lab-model',
    contextWindowTokens: 131_072,
    maximumOutputTokens: 8_192,
    credentialConfigured: true,
    credentialLastFour: '9K4Q',
    isDefault: true,
  }],
};

const draft: AgentProviderDraft = {
  providerId: null,
  kind: 'openai-compatible',
  profileName: 'Local lab',
  baseUrl: 'http://127.0.0.1:43123/v1',
  modelId: 'lab-model',
  contextWindowTokens: 131_072,
  maximumOutputTokens: 8_192,
  credential: { action: 'replace', apiKey: 'secret-9K4Q' },
};

const verification: AgentProviderVerification = {
  verificationId: 'verification-1',
  model: configuredSnapshot.models[0]!,
};

afterEach(() => {
  vi.unstubAllGlobals();
  useAgentModelsStore.setState({
    snapshot: null,
    loading: false,
    busy: false,
    error: null,
  });
});

describe('AgentModelsActions', () => {
  it('loads the redacted Provider snapshot', async () => {
    const interceptor = {
      getAgentModels: vi.fn(async () => emptySnapshot),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });

    await AgentModelsActions.load();

    expect(useAgentModelsStore.getState()).toMatchObject({
      snapshot: emptySnapshot,
      loading: false,
      error: null,
    });
  });

  it('tests without changing the stored snapshot and saves the verification result', async () => {
    const interceptor = {
      testAgentProviderConnection: vi.fn(async () => verification),
      saveVerifiedAgentProvider: vi.fn(async () => configuredSnapshot),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    useAgentModelsStore.setState({ snapshot: emptySnapshot });

    expect(await AgentModelsActions.testConnection(draft)).toEqual(verification);
    expect(useAgentModelsStore.getState().snapshot).toEqual(emptySnapshot);
    await AgentModelsActions.saveVerified(verification.verificationId);

    expect(useAgentModelsStore.getState()).toMatchObject({
      snapshot: configuredSnapshot,
      busy: false,
      error: null,
    });
  });

  it('merges default and remove snapshots without reordering locally', async () => {
    const removedSnapshot: AgentModelsSnapshot = { defaultProviderId: null, models: [] };
    const interceptor = {
      setDefaultAgentModel: vi.fn(async () => configuredSnapshot),
      removeAgentProvider: vi.fn(async () => removedSnapshot),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    useAgentModelsStore.setState({ snapshot: configuredSnapshot });

    await AgentModelsActions.setDefault('provider-1');
    await AgentModelsActions.remove('provider-1');

    expect(useAgentModelsStore.getState().snapshot).toEqual(removedSnapshot);
  });

  it('preserves the last successful snapshot when an action fails', async () => {
    const interceptor = {
      setDefaultAgentModel: vi.fn(async () => {
        throw new Error('default failed');
      }),
    } as unknown as InterceptorDesktopApi;
    vi.stubGlobal('window', { interceptor });
    useAgentModelsStore.setState({ snapshot: configuredSnapshot });

    await expect(AgentModelsActions.setDefault('provider-1')).rejects.toThrow('default failed');

    expect(useAgentModelsStore.getState()).toMatchObject({
      snapshot: configuredSnapshot,
      busy: false,
      error: 'default failed',
    });
  });
});
