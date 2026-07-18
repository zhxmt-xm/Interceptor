import { StatItem } from '../../../components';
import { useTranslation } from 'react-i18next';
import { useBreakpointsStore } from '../breakpointsStore';

/** Breakpoints status bar: paused count, timeout policy and match state. */
export function BreakpointsStatusbar(): React.JSX.Element {
  const { t } = useTranslation();
  const count = useBreakpointsStore((state) => state.breakpoints.length);
  const enabled = useBreakpointsStore((state) => state.enabled);

  return (
    <>
      <StatItem dot={count > 0 ? 'yellow' : enabled ? 'green' : undefined}>
        {t('breakpoints.pausedCount', { count })}
      </StatItem>
      <StatItem>{t('breakpoints.timeoutPolicy')}</StatItem>
      <StatItem mono push>
        {t('breakpoints.matchState', {
          state: enabled ? t('breakpoints.on') : t('breakpoints.off'),
        })}
      </StatItem>
    </>
  );
}
