import { StatItem } from '../../../components';
import { useTranslation } from 'react-i18next';
import { useCaptureStore } from '../captureStore';

/** Capture status bar: truthful recording indicator, loopback binding and loaded count. */
export function CaptureStatusbar(): React.JSX.Element {
  const { t } = useTranslation();
  const capturing = useCaptureStore((state) => state.capturing);
  const rowCount = useCaptureStore((state) => state.rows.length);
  return (
    <>
      {capturing ? (
        <StatItem dot="red">{t('capture.recording')}</StatItem>
      ) : (
        <StatItem>{t('capture.notRecording')}</StatItem>
      )}
      <StatItem mono>127.0.0.1 · {t('capture.loopbackOnly')}</StatItem>
      <StatItem mono push>
        {t('capture.requestCount', { count: rowCount })}
      </StatItem>
    </>
  );
}
