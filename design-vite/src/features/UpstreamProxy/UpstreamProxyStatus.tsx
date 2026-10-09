import { Popover } from 'antd';
import { ArrowUpRight, ChevronUp, Network, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { IconButton } from '../../components/IconButton/IconButton';
import { useDesignState } from '../../state/useDesignState';
import { UpstreamProxyEditor } from './UpstreamProxyEditor';
import styles from './UpstreamProxyStatus.module.css';
import { UPSTREAM_MODE_LABELS, upstreamRouteLabel } from './utils';

export function UpstreamProxyStatus(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const busy = state.upstreamOperation !== 'idle';
  const close = (): void => {
    if (busy) return;
    updateState({ upstreamPopoverOpen: false, upstreamDraft: state.upstreamConfig, upstreamApplyError: '' });
    triggerRef.current?.focus();
  };
  useEffect(() => {
    if (!state.upstreamPopoverOpen) return undefined;
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || state.upstreamOperation !== 'idle') return;
      updateState({ upstreamPopoverOpen: false, upstreamDraft: state.upstreamConfig, upstreamApplyError: '' });
      triggerRef.current?.focus();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [state.upstreamPopoverOpen, state.upstreamConfig, state.upstreamOperation, updateState]);

  const content = (
    <div className={styles.upstreamQuickPanel} role="dialog" aria-label="Upstream proxy" data-design-upstream-popover="" data-parity="upstream-popover">
      <header className={styles.upstreamQuickHeader}>
        <div><h3>Upstream proxy</h3><p>Choose the route for new requests.</p></div>
        <IconButton label="Close upstream settings" disabled={busy} icon={<X size={15} />} onClick={close} />
      </header>
      <div className={styles.upstreamQuickBody}><UpstreamProxyEditor compact /></div>
      <button type="button" className={styles.upstreamSettingsLink} disabled={busy}
        data-design-upstream-open-settings=""
        onClick={() => updateState({ view: 'settings', settings: 'upstream', upstreamPopoverOpen: false })}>
        <span>Open in Settings</span><ArrowUpRight size={14} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div className={styles.upstreamStatusControl}>
      <Popover content={content} trigger="click" placement="topRight" arrow={false}
        open={state.upstreamPopoverOpen && state.view === 'capture'} destroyOnHidden
        onOpenChange={open => open ? updateState({ upstreamPopoverOpen: true }) : close()}
        getPopupContainer={trigger => trigger.closest<HTMLElement>('.app') ?? trigger}
        classNames={{ root: styles.upstreamPopup }}
        styles={{ container: { padding: 0, border: '1px solid var(--border-2)', borderRadius: 12, overflow: 'visible' } }}>
        <button ref={triggerRef} type="button" className={styles.upstreamStatusButton}
          data-design-upstream-trigger="" data-health={state.upstreamHealth} data-parity="capture-status-upstream"
          aria-haspopup="dialog" aria-expanded={state.upstreamPopoverOpen}>
          {state.upstreamHealth === 'unreachable' ? <TriangleAlert size={12} /> : <Network size={12} />}
          <span>Upstream</span>
          <span className={styles.upstreamStatusMode}>{UPSTREAM_MODE_LABELS[state.upstreamConfig.mode]}</span>
          <span className={styles.upstreamStatusRoute}>
            {state.upstreamHealth === 'unreachable' ? 'Unreachable' : upstreamRouteLabel(state.upstreamConfig)}
          </span>
          <ChevronUp size={12} aria-hidden="true" />
        </button>
      </Popover>
    </div>
  );
}
