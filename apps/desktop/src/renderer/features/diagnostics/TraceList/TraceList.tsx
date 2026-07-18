import { cx } from '../../../components';
import { useTranslation } from 'react-i18next';
import { aggregateTraces } from '../data';
import { useDiagnostics } from '../DiagnosticsProvider';
import styles from './TraceList.module.css';

/** Left diagnostics pane: the scrollable trace/command table. */
export function TraceList(): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const {
    records,
    selectedKey,
    setSelectedKey,
    hasMore,
    loadingMore,
    loadMore,
  } = useDiagnostics();
  const rows = aggregateTraces(records, i18n.language, {
    success: t('diagnostics.success'),
    failed: t('diagnostics.failed'),
    cancelled: t('diagnostics.cancelled'),
    timedOut: t('diagnostics.timedOut'),
    ok: t('diagnostics.ok'),
  });

  return (
    <div className={styles.list}>
      <div className={styles.head}>
        <span>{t('diagnostics.time')}</span>
        <span>{t('diagnostics.command')}</span>
        <span>{t('diagnostics.level')}</span>
        <span>{t('diagnostics.outcome')}</span>
        <span className={styles.right}>{t('diagnostics.duration')}</span>
      </div>

      <div className={styles.body}>
        {rows.length === 0 ? (
          <div className={styles.empty}>{t('diagnostics.empty')}</div>
        ) : (
          rows.map((row) => (
            <button
              type="button"
              key={row.key}
              className={cx(styles.row, row.key === selectedKey && styles.selected)}
              onClick={() => setSelectedKey(row.key)}
            >
              <span className={styles.time}>{row.time}</span>
              <span className={styles.command}>
                <span className={styles.process}>{row.process} · </span>
                {row.command}
              </span>
              <span className={cx(styles.level, styles[row.level])}>
                <span className={styles.dot} />
                {row.level}
              </span>
              <span className={cx(styles.outcome, styles[row.outcome])}>
                {row.outcomeLabel}
              </span>
              <span className={styles.duration}>{row.duration}</span>
            </button>
          ))
        )}
        {hasMore ? (
          <button
            type="button"
            className={styles.loadMore}
            disabled={loadingMore}
            onClick={loadMore}
          >
            {loadingMore ? t('diagnostics.loading') : t('diagnostics.loadEarlier')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
