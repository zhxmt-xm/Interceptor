import { Download } from 'lucide-react';
import { useMemo } from 'react';

import { Count, cx, FilterChip, IconButton } from '../../../components';
import { useTranslation } from 'react-i18next';
import { aggregateTraces } from '../utils';
import { useDiagnostics } from '../data/DiagnosticsProvider';
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
    processFilter,
    levelFilter,
    outcomeFilter,
    cycleProcess,
    cycleLevel,
    cycleOutcome,
    exporting,
    exportError,
    exportJsonl,
  } = useDiagnostics();
  const rows = useMemo(
    () =>
      aggregateTraces(records, i18n.language, {
        success: t('diagnostics.success'),
        failed: t('diagnostics.failed'),
        cancelled: t('diagnostics.cancelled'),
        timedOut: t('diagnostics.timedOut'),
        ok: t('diagnostics.ok'),
      }),
    [records, i18n.language, t],
  );

  return (
    <div className={styles.list}>
      <div className={styles.toolbar}>
        <Count>
          {t('diagnostics.records', {
            count: new Intl.NumberFormat(i18n.language).format(records.length),
          })}
        </Count>
        <span className={styles.spacer} />
        <FilterChip onClick={cycleProcess}>
          {processFilter ? `${t('diagnostics.process')}: ${processFilter}` : t('diagnostics.process')}
        </FilterChip>
        <FilterChip onClick={cycleLevel}>
          {levelFilter ? `${t('diagnostics.level')}: ${levelFilter}` : t('diagnostics.level')}
        </FilterChip>
        <FilterChip onClick={cycleOutcome}>
          {outcomeFilter ? `${t('diagnostics.outcome')}: ${outcomeFilter}` : t('diagnostics.outcome')}
        </FilterChip>
        <IconButton
          icon={Download}
          label={exporting
            ? t('diagnostics.exporting')
            : exportError
              ? t('diagnostics.exportFailed')
              : t('diagnostics.exportJsonl')}
          size="sm"
          className={exportError ? styles.exportError : undefined}
          disabled={exporting}
          onClick={exportJsonl}
        />
      </div>
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
