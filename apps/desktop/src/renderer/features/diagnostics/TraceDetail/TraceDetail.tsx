import { SectionHeader, Timeline } from '../../../components';
import { useTranslation } from 'react-i18next';
import { buildTimeline, selectTraceRecords } from '../utils';
import { useDiagnostics } from '../data/diagnosticsContext';
import styles from './TraceDetail.module.css';

/** Right diagnostics pane: identifiers and the action timeline. */
export function TraceDetail(): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const { records, selectedKey } = useDiagnostics();
  const traceRecords = selectTraceRecords(records, selectedKey);
  const sorted = [...traceRecords].sort((a, b) => a.sequence - b.sequence);
  const [first] = sorted;

  if (!first) {
    return (
      <div className={styles.detail}>
        <div className={styles.scroll}>
          <SectionHeader>{t('diagnostics.actionTimeline')}</SectionHeader>
          <div className={styles.empty}>
            {t('diagnostics.selectCommand')}
          </div>
        </div>
      </div>
    );
  }

  const completed =
    sorted.find((record) => record.phase === 'command.completed') ??
    sorted[sorted.length - 1] ??
    first;
  const command =
    sorted.find((record) => record.command)?.command ?? first.phase;
  const outcomeLabel =
    completed.outcome ?? (completed.level === 'error' ? 'failed' : 'ok');
  const duration =
    completed.durationMs != null
      ? ` · ${new Intl.NumberFormat(i18n.language).format(completed.durationMs)} ms`
      : '';

  return (
    <div className={styles.detail}>
      <div className={styles.top}>
        <span className={styles.command}>{command}</span>
        <div className={styles.ids}>
          <span className={styles.idpill}>{first.process}</span>
          {first.traceId ? (
            <span className={styles.idpill}>trace {first.traceId}</span>
          ) : null}
          {first.requestId ? (
            <span className={styles.idpill}>req {first.requestId}</span>
          ) : null}
          <span className={styles.idpill}>
            {outcomeLabel}
            {duration}
          </span>
          {completed.errorCode ? (
            <span className={styles.idpill}>{completed.errorCode}</span>
          ) : null}
        </div>
      </div>
      <div className={styles.scroll}>
        <SectionHeader>{t('diagnostics.actionTimeline')}</SectionHeader>
        <Timeline entries={buildTimeline(sorted, i18n.language)} />
      </div>
    </div>
  );
}
