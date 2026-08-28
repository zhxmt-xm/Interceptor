import type { AgentModelId, AgentProviderProfileState } from '../../state/types';

export type AgentProviderForm = Omit<AgentProviderProfileState, 'displayName'>;

const EMPTY_CUSTOM_FORM: AgentProviderForm = {
  profileName: '',
  baseUrl: '',
  apiKey: '',
  modelId: '',
  contextWindow: '',
  maximumOutput: '',
};

export function agentProviderForm(
  target: AgentModelId | '',
  deepSeekProfile: AgentProviderProfileState,
  qwenProfile: AgentProviderProfileState,
  addedProfile: AgentProviderProfileState | null,
): AgentProviderForm {
  const profile = target === 'deepseek'
    ? deepSeekProfile
    : target === 'qwen'
      ? qwenProfile
      : target === 'added'
        ? addedProfile
        : null;
  if (profile) {
    return {
      profileName: profile.profileName,
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
      modelId: profile.modelId,
      contextWindow: profile.contextWindow,
      maximumOutput: profile.maximumOutput,
    };
  }
  return EMPTY_CUSTOM_FORM;
}

export function isAgentProviderFormComplete(
  form: AgentProviderForm,
  custom: boolean,
): boolean {
  const requiredValues = custom
    ? [form.profileName, form.baseUrl, form.modelId, form.contextWindow, form.maximumOutput]
    : [form.profileName, form.apiKey, form.modelId];
  return requiredValues.every((value) => value.trim().length > 0);
}