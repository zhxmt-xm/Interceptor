import { StatItem } from '../../../components';
import { useTranslation } from 'react-i18next';
import { useDiagnostics } from '../DiagnosticsProvider';

/** Diagnostics status bar: record count, drop count and retention policy. */
export function DiagnosticsStatusbar(): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const { records, droppedCount } = useDiagnostics();

  return (
    <>
      <StatItem dot="green">{t('diagnostics.title')}</StatItem>
      <StatItem mono>{t('diagnostics.records', { count: new Intl.NumberFormat(i18n.language).format(records.length) })}</StatItem>
      <StatItem>{t('diagnostics.dropped', { count: new Intl.NumberFormat(i18n.language).format(droppedCount) })}</StatItem>
      <StatItem mono push>
        {t('diagnostics.retention')}
      </StatItem>
    </>
  );
}
