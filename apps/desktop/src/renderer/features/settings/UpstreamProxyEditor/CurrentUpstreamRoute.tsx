import { CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import type { UpstreamSettingsSnapshot } from '../../../../shared/desktop-api';
import styles from './CurrentUpstreamRoute.module.css';
import { upstreamModeLabel, upstreamRouteLabel, upstreamRouteTitle } from './utils';

interface CurrentUpstreamRouteProps {
  readonly snapshot: UpstreamSettingsSnapshot | null;
  readonly compact: boolean;
}

export function CurrentUpstreamRoute({ snapshot, compact }: CurrentUpstreamRouteProps): React.JSX.Element {
  const { t } = useTranslation();
  const unreachable = snapshot?.health === 'unreachable';
  const unavailable = !snapshot || snapshot.route.kind === 'unavailable';
  return (
    <div className={styles.currentRoute} data-compact={compact} data-health={snapshot?.health ?? 'unknown'}
      data-parity="upstream-current-route" data-automation-id={AUTOMATION_IDS.upstream.currentRoute}
      data-upstream-mode={snapshot?.settings.mode} data-route-kind={snapshot?.route.kind ?? 'unavailable'}>
      <div className={styles.currentRouteLabel} data-parity="upstream-current-label">
        {unreachable ? <TriangleAlert size={15} aria-hidden="true" />
          : unavailable ? <Info size={15} aria-hidden="true" /> : <CircleCheck size={15} aria-hidden="true" />}
        <span>{t(unreachable ? 'upstream.unreachable' : 'upstream.currentRoute')}</span>
      </div>
      <div className={styles.currentRouteValue} data-parity="upstream-current-value">
        {snapshot ? <span>{upstreamModeLabel(snapshot.settings.mode, key => t(key))}</span> : null}
        <code title={snapshot ? upstreamRouteTitle(snapshot.route) : undefined}>
          {snapshot ? upstreamRouteLabel(snapshot.route, key => t(key)) : t('upstream.unavailable')}
        </code>
      </div>
    </div>
  );
}
