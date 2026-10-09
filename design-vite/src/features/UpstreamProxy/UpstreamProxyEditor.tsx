import { Input, Radio, Select } from 'antd';
import { CircleCheck, Info, LoaderCircle, TriangleAlert } from 'lucide-react';

import { ActionButton } from '../../components/ActionButton/ActionButton';
import { useDesignState } from '../../state/useDesignState';
import type { UpstreamDesignConfig, UpstreamProxyProtocol } from '../../state/types';
import styles from './UpstreamProxyEditor.module.css';
import { UPSTREAM_MODES, UPSTREAM_MODE_LABELS, upstreamDraftChanged, upstreamDraftError, upstreamRouteLabel } from './utils';

interface UpstreamProxyEditorProps {
  readonly compact?: boolean;
}

export function UpstreamProxyEditor({ compact = false }: UpstreamProxyEditorProps): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const draft = state.upstreamDraft;
  const busy = state.upstreamOperation !== 'idle';
  const dirty = upstreamDraftChanged(draft, state.upstreamConfig);
  const invalid = upstreamDraftError(draft);
  const id = compact ? 'upstream-quick' : 'upstream-settings';
  const edit = (change: Partial<UpstreamDesignConfig>): void => updateState({
    upstreamDraft: { ...draft, ...change }, upstreamApplyError: '',
  });
  const apply = (): void => updateState({
    upstreamApplyRequested: true,
    upstreamOperation: draft.mode === 'wpad' ? 'discovering' : 'applying',
    upstreamApplyError: '',
  });
  const reset = (): void => updateState({
    upstreamDraft: state.upstreamConfig, upstreamApplyError: '',
    ...(compact ? { upstreamPopoverOpen: false } : {}),
  });

  return (
    <div className={styles.upstreamEditor} data-design-upstream-editor={compact ? 'quick' : 'settings'}
      data-compact={compact} data-parity="upstream-editor" aria-busy={busy}>
      <div className={styles.upstreamCurrent} data-health={state.upstreamHealth} data-parity="upstream-current-route">
        <div className={styles.upstreamCurrentLabel} data-parity="upstream-current-label">
          {state.upstreamHealth === 'unreachable' ? <TriangleAlert size={15} /> : <CircleCheck size={15} />}
          <span>{state.upstreamHealth === 'unreachable' ? 'Upstream unreachable' : 'Current route'}</span>
        </div>
        <div className={styles.upstreamCurrentValue} data-design-upstream-current={state.upstreamConfig.mode} data-parity="upstream-current-value">
          <span>{UPSTREAM_MODE_LABELS[state.upstreamConfig.mode]}</span>
          <code title={upstreamRouteLabel(state.upstreamConfig)}>{upstreamRouteLabel(state.upstreamConfig)}</code>
        </div>
      </div>

      <div className={styles.upstreamConfiguration}>
        <div className={styles.upstreamModeSection}>
          <div className={styles.upstreamSectionTitle}>
            <span>Connection mode</span>
            {dirty ? <span className={styles.upstreamUnsaved}>Not applied</span> : null}
          </div>
          <Radio.Group value={draft.mode} name={`${id}-mode`} disabled={busy}
            className={styles.upstreamModes} aria-label="Upstream connection mode" data-parity="upstream-modes">
            {UPSTREAM_MODES.map(option => (
              <Radio key={option.mode} value={option.mode}
                onChange={() => edit({ mode: option.mode })}
                className={[styles.upstreamModeOption, draft.mode === option.mode ? styles.upstreamModeSelected : ''].filter(Boolean).join(' ')}
                data-design-upstream-mode={option.mode}
                styles={{ root: { alignItems: 'center', marginInlineEnd: 0 }, label: { flex: 1, minWidth: 0 } }}>
                <span className={styles.upstreamOptionLabel}>
                  <span>{option.label}</span>
                  {option.mode === 'system' ? <small>Default</small> : null}
                </span>
                {!compact ? <span className={styles.upstreamOptionDescription}>{option.description}</span> : null}
              </Radio>
            ))}
          </Radio.Group>
        </div>

        <div className={styles.upstreamModeDetails}>
          {!compact ? <div className={styles.upstreamSectionTitle}>Configuration</div> : null}
          {draft.mode === 'manual' ? (
            <div className={styles.upstreamFields}>
              <div className={styles.upstreamField}>
                <label htmlFor={`${id}-protocol`}>Protocol</label>
                <Select<UpstreamProxyProtocol> id={`${id}-protocol`} value={draft.protocol}
                  disabled={busy} size="middle" onChange={protocol => edit({ protocol })}
                  options={[{ label: 'HTTP', value: 'http' }, { label: 'HTTPS', value: 'https' }, { label: 'SOCKS5', value: 'socks5' }]}
                  getPopupContainer={trigger => trigger.parentElement ?? trigger} />
              </div>
              <div className={styles.upstreamAddressFields}>
                <div className={styles.upstreamField}>
                  <label htmlFor={`${id}-host`}>Host</label>
                  <Input id={`${id}-host`} value={draft.host} disabled={busy} size="middle"
                    placeholder="127.0.0.1" onChange={event => edit({ host: event.target.value })}
                    className={styles.upstreamTechnicalInput} />
                </div>
                <div className={styles.upstreamField}>
                  <label htmlFor={`${id}-port`}>Port</label>
                  <Input id={`${id}-port`} value={draft.port} disabled={busy} size="middle" inputMode="numeric"
                    placeholder="7890" onChange={event => edit({ port: event.target.value })}
                    className={styles.upstreamTechnicalInput} />
                </div>
              </div>
              <p className={styles.upstreamHint}>Only Interceptor's outgoing traffic uses this server.</p>
            </div>
          ) : draft.mode === 'pac' ? (
            <div className={styles.upstreamFields}>
              <div className={styles.upstreamField}>
                <label htmlFor={`${id}-pac`}>PAC URL</label>
                <Input id={`${id}-pac`} value={draft.pacUrl} disabled={busy} size="middle" type="url"
                  placeholder="https://proxy.example.test/proxy.pac"
                  onChange={event => edit({ pacUrl: event.target.value })}
                  className={styles.upstreamTechnicalInput} />
              </div>
              <p className={styles.upstreamHint}>The script selects a proxy or DIRECT for each destination.</p>
            </div>
          ) : (
            <div className={styles.upstreamExplanation}>
              <b>{draft.mode === 'system' ? 'Use the original system route'
                : draft.mode === 'direct' ? 'Capture stays on' : 'Discover on the current network'}</b>
              <p>{draft.mode === 'system'
                ? 'Use the proxy or PAC settings saved before Interceptor took over. System Auto Detect uses WPAD discovery.'
                : draft.mode === 'direct'
                  ? 'Requests still pass through Interceptor. Core connects to the destination without another proxy.'
                  : 'Look for a PAC configuration through DNS or DHCP. No proxy address or PAC URL is required.'}</p>
              {draft.mode === 'wpad' ? <p className={styles.upstreamHint}>If discovery fails, the current route is kept. No silent switch to direct.</p> : null}
            </div>
          )}
          {invalid ? <div role="alert" className={styles.upstreamError}><TriangleAlert size={15} /><span>{invalid}</span></div> : null}
        </div>
      </div>

      {state.upstreamApplyError ? (
        <div role="alert" className={styles.upstreamError} data-design-upstream-error={state.upstreamApplyError}>
          <TriangleAlert size={16} />
          <span><b>{state.upstreamApplyError === 'discovery' ? 'No WPAD configuration found.' : 'Could not apply this upstream.'}</b>{' '}
            {state.upstreamApplyError === 'discovery' ? 'Check this network or use a PAC URL.' : 'Check the address and try again.'}
            {' '}Your current route is unchanged.</span>
        </div>
      ) : busy ? (
        <div className={styles.upstreamProgress} role="status">
          <LoaderCircle className={styles.upstreamSpinner} size={16} />
          <span>{state.upstreamOperation === 'discovering' ? 'Looking for a PAC configuration on this network…' : 'Applying upstream configuration…'}</span>
        </div>
      ) : null}

      <div className={styles.upstreamFooter}>
        <p className={styles.upstreamFootnote}><Info size={14} /><span>Applies to new requests. Existing connections stay open.</span></p>
        <div className={styles.upstreamActions}>
          <ActionButton label={compact ? 'Cancel' : 'Discard changes'} disabled={busy || (!compact && !dirty && !state.upstreamApplyError)}
            onClick={reset} />
          <ActionButton label={busy ? (draft.mode === 'wpad' ? 'Discovering…' : 'Applying…')
            : state.upstreamApplyError ? 'Retry' : 'Apply'}
            tone="primary" disabled={busy || Boolean(invalid) || (!dirty && !state.upstreamApplyError && state.upstreamHealth === 'ready')}
            onClick={apply} />
        </div>
      </div>
    </div>
  );
}
