import { Check, EyeOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { IconButton } from '../../components/IconButton/IconButton';
import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import { useDesignState } from '../../state/useDesignState';
import { ProviderLogo } from '../Agent/ProviderLogo';
import { agentProviderForm, isAgentProviderFormComplete, type AgentProviderForm } from './agentProviderForm';
import styles from './AgentProviderDialog.module.css';

export function AgentProviderDialog(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  const custom = state.agentProviderDialog === 'custom';
  const editingCustom = custom && state.agentProviderDialogMode === 'edit';
  const [form, setForm] = useState<AgentProviderForm>(() => agentProviderForm(
    'deepseek',
    state.agentDeepSeekProfile,
    state.agentQwenProfile,
    state.agentAddedProfile,
  ));
  const [verified, setVerified] = useState(true);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.agentProviderDialog) return undefined;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    firstFieldRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, [state.agentProviderDialog]);

  useEffect(() => {
    setForm(agentProviderForm(
      state.agentProviderDialogTarget,
      state.agentDeepSeekProfile,
      state.agentQwenProfile,
      state.agentAddedProfile,
    ));
    setVerified(state.agentProviderDialog === 'deepseek' || state.agentProviderDialogMode === 'edit');
  }, [
    state.agentAddedProfile,
    state.agentDeepSeekProfile,
    state.agentProviderDialog,
    state.agentProviderDialogMode,
    state.agentProviderDialogTarget,
    state.agentQwenProfile,
  ]);

  if (!state.agentProviderDialog) {
    return null;
  }

  const close = (): void => updateState({ agentProviderDialog: '' });
  const setFieldValue = (field: keyof AgentProviderForm, value: string): void => {
    setForm((current) => ({ ...current, [field]: value }));
    setVerified(false);
  };
  const complete = isAgentProviderFormComplete(form, custom);
  const verifyConnection = (): void => {
    if (complete) setVerified(true);
  };
  const save = (): void => {
    if (!verified) return;
    if (state.agentProviderDialogTarget === 'deepseek') {
      updateState({
        agentDeepSeekProfile: {
          ...form,
          displayName: form.modelId === state.agentDeepSeekProfile.modelId
            ? state.agentDeepSeekProfile.displayName
            : form.modelId,
        },
        agentProvider: 'configured',
        agentProviderDialog: '',
      });
    } else if (state.agentProviderDialogTarget === 'qwen') {
      updateState({
        agentQwenProfile: {
          ...form,
          displayName: form.modelId === state.agentQwenProfile.modelId
            ? state.agentQwenProfile.displayName
            : form.modelId,
        },
        agentProvider: 'configured',
        agentProviderDialog: '',
      });
    } else {
      updateState({
        agentAddedProfile: { ...form, displayName: form.profileName },
        agentRemovedModels: state.agentRemovedModels.filter((modelId) => modelId !== 'added'),
        agentProvider: 'configured',
        agentProviderDialog: '',
      });
    }
  };
  return (
    <div
      className={styles.modelProviderDialogOverlay}
      onKeyDown={(event) => {
        if (event.key === 'Escape') close();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        aria-labelledby="model-provider-dialog-title"
        aria-modal="true"
        className={styles.modelProviderDialog}
        data-parity="model-provider-dialog"
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            close();
            return;
          }
          if (event.key !== 'Tab') return;
          const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          )];
          if (focusable.length === 0) return;
          const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
          const nextIndex = event.shiftKey
            ? activeIndex <= 0 ? focusable.length - 1 : activeIndex - 1
            : activeIndex === focusable.length - 1 ? 0 : activeIndex + 1;
          event.preventDefault();
          focusable[nextIndex]?.focus();
        }}
      >
        <header className={styles.modelProviderDialogHeader}>
          <span className={styles.modelProviderDialogIcon}>
            <ProviderLogo active={!custom} brand={custom ? 'unknown' : 'deepseek'} />
          </span>
          <div>
            <h2 id="model-provider-dialog-title">
              {custom ? 'OpenAI-compatible provider' : 'DeepSeek'}
            </h2>
            <span>{custom ? 'Connect a remote gateway or local model server.' : 'Edit the hosted DeepSeek connection.'}</span>
          </div>
          <IconButton label="Close" icon={<X aria-hidden="true" />} onClick={close} />
        </header>

        <div className={styles.modelProviderDialogBody}>
          <label className={styles.modelProviderField}>
            <span>Profile name</span>
            <span className={styles.modelProviderTextInput} data-parity="model-provider-field-control">
              <input
                onChange={(event) => setFieldValue('profileName', event.currentTarget.value)}
                placeholder={custom && !editingCustom ? 'My provider' : undefined}
                ref={firstFieldRef}
                value={form.profileName}
              />
            </span>
          </label>
          {custom ? (
            <label className={styles.modelProviderField}>
              <span>Base URL</span>
              <span className={styles.modelProviderTextInput} data-parity="model-provider-field-control">
                <input
                  onChange={(event) => setFieldValue('baseUrl', event.currentTarget.value)}
                  placeholder="http://127.0.0.1:11434/v1"
                  spellCheck={false}
                  value={form.baseUrl}
                />
              </span>
              <small>Must expose an OpenAI-compatible Chat Completions endpoint.</small>
            </label>
          ) : (
            <label className={styles.modelProviderField}>
              <span>Endpoint</span>
              <span className={styles.modelProviderTextInput} data-disabled="true" data-parity="model-provider-field-control">
                <input disabled spellCheck={false} value={form.baseUrl} />
              </span>
            </label>
          )}
          <label className={styles.modelProviderField}>
            <span>API key {custom && <em>Optional for local servers</em>}</span>
            <span className={styles.modelProviderSecretInput} data-parity="model-provider-field-control">
              <EyeOff aria-hidden="true" />
              <input
                aria-label="API key"
                onChange={(event) => setFieldValue('apiKey', event.currentTarget.value)}
                placeholder={custom && !editingCustom ? 'No API key' : undefined}
                type="password"
                value={form.apiKey}
              />
            </span>
          </label>
          <label className={styles.modelProviderField}>
            <span>Model ID</span>
            <span className={styles.modelProviderTextInput} data-parity="model-provider-field-control">
              <input
                onChange={(event) => setFieldValue('modelId', event.currentTarget.value)}
                placeholder={custom && !editingCustom ? 'model-id' : undefined}
                spellCheck={false}
                value={form.modelId}
              />
            </span>
          </label>
          {custom && (
            <div className={styles.modelCapabilityFields}>
              <label className={styles.modelProviderField}>
                <span>Context window</span>
                <span className={styles.modelProviderNumberInput} data-parity="model-provider-field-control"><input inputMode="numeric" onChange={(event) => setFieldValue('contextWindow', event.currentTarget.value)} placeholder="131072" value={form.contextWindow} /><code>tokens</code></span>
              </label>
              <label className={styles.modelProviderField}>
                <span>Maximum output</span>
                <span className={styles.modelProviderNumberInput} data-parity="model-provider-field-control"><input inputMode="numeric" onChange={(event) => setFieldValue('maximumOutput', event.currentTarget.value)} placeholder="8192" value={form.maximumOutput} /><code>tokens</code></span>
              </label>
            </div>
          )}
          {verified && (
            <div className={styles.modelProviderConnectionResult} role="status">
              <Check aria-hidden="true" />
              <span>Connection verified</span>
              <code>{form.modelId} · {custom ? form.contextWindow : '1M'} context</code>
            </div>
          )}
        </div>

        <footer className={styles.modelProviderDialogFooter}>
          <button className={fixtureClassNames('btn')} disabled={!complete} type="button" onClick={verifyConnection}>Test connection</button>
          <span />
          <button className={fixtureClassNames('btn')} type="button" onClick={close}>Cancel</button>
          <button className={fixtureClassNames('btn pri')} disabled={!verified} type="button" onClick={save}>
            {custom && !editingCustom ? 'Save provider' : 'Save changes'}
          </button>
        </footer>
      </section>
    </div>
  );
}