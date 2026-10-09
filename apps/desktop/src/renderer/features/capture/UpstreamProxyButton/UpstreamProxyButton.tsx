import { ArrowUpRight, ChevronUp, Network, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Flyout, IconButton } from '../../../components';
import { UpstreamSettingsActions, useUpstreamSettingsStore } from '../../settings/data/upstreamSettingsStore';
import { UpstreamProxyEditor } from '../../settings/UpstreamProxyEditor/UpstreamProxyEditor';
import { upstreamModeLabel, upstreamRouteLabel, upstreamRouteTitle } from '../../settings/UpstreamProxyEditor/utils';
import styles from './UpstreamProxyButton.module.css';

interface UpstreamProxyButtonProps {
  readonly onOpenSettings: () => void;
}

export function UpstreamProxyButton({ onOpenSettings }: UpstreamProxyButtonProps): React.JSX.Element {
  const { t } = useTranslation();
  const { snapshot, busy, popoverOpen } = useUpstreamSettingsStore();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const applying = busy || (snapshot !== null && snapshot.operation !== 'idle');
  useEffect(() => {
    if (!popoverOpen) return undefined;
    const close = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || applying) return;
      UpstreamSettingsActions.cancelDraft();
      triggerRef.current?.focus();
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [popoverOpen, applying]);

  return (
    <div className={styles.upstreamStatusControl}>
      <Flyout open={popoverOpen} placement="topRight" padding={0} destroyOnHidden className={styles.upstreamFlyout}
        onOpenChange={open => {
          if (open) UpstreamSettingsActions.openPopover();
          else if (!applying) UpstreamSettingsActions.cancelDraft();
        }}
        content={<div className={styles.upstreamQuickPanel} role="dialog" aria-label={t('upstream.title')}
          data-automation-id={AUTOMATION_IDS.upstream.popover} data-parity="upstream-popover">
          <header className={styles.upstreamQuickHeader}>
            <div><h3>{t('upstream.title')}</h3><p>{t('upstream.quickDescription')}</p></div>
            <IconButton icon={X} size="sm" strokeWidth={2} label={t('common.close')} disabled={applying} automationId={AUTOMATION_IDS.upstream.close}
              onClick={() => { UpstreamSettingsActions.cancelDraft(); triggerRef.current?.focus(); }} />
          </header>
          <div className={styles.upstreamQuickBody}><UpstreamProxyEditor compact /></div>
          <button type="button" className={styles.upstreamSettingsLink} disabled={applying}
            data-automation-id={AUTOMATION_IDS.upstream.openSettings}
            onClick={() => { UpstreamSettingsActions.closePopover(); onOpenSettings(); }}>
            <span>{t('upstream.openSettings')}</span><ArrowUpRight size={14} aria-hidden="true" />
          </button>
        </div>}>
        <button ref={triggerRef} type="button" className={styles.upstreamStatusButton}
          data-automation-id={AUTOMATION_IDS.upstream.trigger} data-parity="capture-status-upstream"
          data-health={snapshot?.health ?? 'unknown'} data-upstream-mode={snapshot?.settings.mode}
          title={snapshot ? upstreamRouteTitle(snapshot.route) : undefined}
          aria-haspopup="dialog" aria-expanded={popoverOpen}>
          {snapshot?.health === 'unreachable' ? <TriangleAlert size={12} aria-hidden="true" /> : <Network size={12} aria-hidden="true" />}
          <span>{t('upstream.trigger')}</span>
          {snapshot ? <span className={styles.upstreamStatusMode}>{upstreamModeLabel(snapshot.settings.mode, key => t(key))}</span> : null}
          <span className={styles.upstreamStatusRoute}>
            {snapshot?.health === 'unreachable' ? t('upstream.unreachableShort')
              : snapshot ? upstreamRouteLabel(snapshot.route, key => t(key)) : t('upstream.unavailable')}
          </span>
          <ChevronUp size={12} aria-hidden="true" />
        </button>
      </Flyout>
    </div>
  );
}
