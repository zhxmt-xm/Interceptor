import { StatItem } from '../../../components';
import { useTranslation } from 'react-i18next';
import type { CoreProcessStatus } from '../../../../shared/desktop-api';
import { useCaptureStore } from '../data/captureStore';

const CORE_STATE_KEYS: Record<CoreProcessStatus['state'], string> = {
  starting: 'coreState.starting',
  running: 'coreState.running',
  unresponsive: 'coreState.unresponsive',
  restarting: 'coreState.restarting',
  stopping: 'coreState.stopping',
  stopped: 'coreState.stopped',
};

export interface CaptureStatusbarProps {
  coreStatus: CoreProcessStatus;
}

/** Capture status bar: truthful recording indicator, loopback binding and loaded count. */
export function CaptureStatusbar({ coreStatus }: CaptureStatusbarProps): React.JSX.Element {
  const { t } = useTranslation();
  const capturing = useCaptureStore((state) =>
    state.capturing && state.proxyReadinessIssue === null);
  const rowCount = useCaptureStore((state) => state.rows.length);
  return (
    <>
      {capturing ? (
        <StatItem dot="red">{t('capture.recording')}</StatItem>
      ) : (
        <StatItem>{t('capture.notRecording')}</StatItem>
      )}
      <StatItem dot={coreStatus.state === 'running' ? 'green' : 'yellow'}>
        {t('sidebar.coreTitle', {
          state: t(CORE_STATE_KEYS[coreStatus.state]),
          pid: '',
        })}
      </StatItem>
      <StatItem mono>127.0.0.1 · {t('capture.loopbackOnly')}</StatItem>
      <StatItem mono push>
        {t('capture.requestCount', { count: rowCount })}
      </StatItem>
    </>
  );
}
