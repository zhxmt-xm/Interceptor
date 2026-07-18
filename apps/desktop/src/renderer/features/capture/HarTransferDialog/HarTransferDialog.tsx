import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  HarExportRequest,
  TransferJobSnapshot,
} from '../../../../shared/desktop-api';
import { Button, Checkbox, cx } from '../../../components';
import { usePrivacyStore } from '../../settings/privacyStore';
import { useCaptureStore, visibleCaptureRows } from '../captureStore';
import { refetchSessions } from '../useCaptureData';
import styles from './HarTransferDialog.module.css';

const JOB_POLL_MS = 350;

type ExportScopeKind = HarExportRequest['scope']['kind'];

/** HAR 1.2 import/export options, progress, cancellation and completion overlay. */
export function HarTransferDialog(): React.JSX.Element | null {
  const { t } = useTranslation();
  const open = useCaptureStore((state) => state.harDialogOpen);
  const rows = useCaptureStore((state) => state.rows);
  const selectedId = useCaptureStore((state) => state.selectedId);
  const filter = useCaptureStore((state) => state.filter);
  const setOpen = useCaptureStore((state) => state.setHarDialogOpen);
  const warnBeforeUnmasked = usePrivacyStore((state) => state.warnBeforeUnmasked);
  const [format, setFormat] = useState<'har' | 'archive'>('har');
  const [scope, setScope] = useState<ExportScopeKind>('filter');
  const [authorization, setAuthorization] = useState(true);
  const [cookies, setCookies] = useState(true);
  const [bodies, setBodies] = useState(false);
  const [job, setJob] = useState<TransferJobSnapshot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allCount, setAllCount] = useState(rows.length);

  const visibleCount = visibleCaptureRows(rows, filter).length;
  const exportCount = scope === 'all'
    ? allCount
    : scope === 'selected'
      ? (selectedId ? 1 : 0)
      : visibleCount;
  const running = job?.state === 'running';

  useEffect(() => {
    if (!open) {
      return;
    }
    setJob(null);
    setError(null);
    setSubmitting(false);
    setFormat('har');
    const prefs = usePrivacyStore.getState();
    setAuthorization(prefs.maskAuthorization);
    setCookies(prefs.maskCookies);
    setBodies(false);
    setAllCount(rows.length);
    void window.interceptor.getStorageStatus().then((usage) => {
      setAllCount(usage.exchangeCount);
    }).catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!job || job.state !== 'running') {
      return;
    }
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      try {
        const next = await window.interceptor.getTransferJob(job.id);
        if (!active || !next) {
          return;
        }
        setJob(next);
        if (next.state === 'running') {
          timeout = setTimeout(() => void poll(), JOB_POLL_MS);
        } else if (next.state === 'completed') {
          if (next.kind === 'har-import' || next.kind === 'archive-import') {
            await refetchSessions();
          }
          setOpen(false);
        }
      } catch (reason) {
        if (active) {
          setError(describeError(reason));
        }
      }
    };
    timeout = setTimeout(() => void poll(), JOB_POLL_MS);
    return () => {
      active = false;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [job?.id, job?.state]);

  useEffect(() => {
    if (!open || running) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, running, setOpen]);

  if (!open) {
    return null;
  }

  const close = (): void => {
    if (!running) {
      setOpen(false);
    }
  };

  const startExport = async (): Promise<void> => {
    if (format === 'har' && scope === 'selected' && !selectedId) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const started = format === 'archive'
        ? await window.interceptor.startArchiveExport()
        : await window.interceptor.startHarExport({
            scope: buildScope(scope, selectedId, filter),
            redaction: { authorization, cookies, bodies },
          });
      if (started) {
        setJob(started);
      }
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setSubmitting(false);
    }
  };

  const startImport = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      const started = format === 'archive'
        ? await window.interceptor.startArchiveImport()
        : await window.interceptor.startHarImport();
      if (started) {
        setJob(started);
      }
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (): Promise<void> => {
    if (!job) {
      return;
    }
    try {
      const next = await window.interceptor.cancelTransferJob(job.id);
      if (next) {
        setJob(next);
        setOpen(false);
      }
    } catch (reason) {
      setError(describeError(reason));
    }
  };

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="har-transfer-title"
      >
        <header className={styles.header}>
          <span className={styles.headerIcon}>
            <Download size={16} strokeWidth={1.9} />
          </span>
          <h2 id="har-transfer-title">{t('capture.harTransferTitle')}</h2>
          <button
            type="button"
            className={styles.close}
            aria-label={t('capture.closeTransfer')}
            disabled={running}
            onClick={close}
          >
            <X size={18} strokeWidth={1.9} />
          </button>
        </header>

        {job ? (
          <JobProgress job={job} error={error} />
        ) : (
          <div className={styles.body}>
            <div className={styles.field}>
              <span className={styles.label}>{t('capture.format')}</span>
              <div className={styles.segmented}>
                <button
                  type="button"
                  className={cx(
                    styles.segmentButton,
                    format === 'har' && styles.segmentActive,
                  )}
                  onClick={() => setFormat('har')}
                >
                  HAR 1.2
                </button>
                <button
                  type="button"
                  className={cx(
                    styles.segmentButton,
                    format === 'archive' && styles.segmentActive,
                  )}
                  onClick={() => setFormat('archive')}
                >
                  {t('capture.nativeArchive')}
                </button>
              </div>
              {format === 'har' ? (
                <div className={styles.warning}>
                  <AlertTriangle size={15} strokeWidth={1.9} />
                  <span>
                    {t('capture.harWarning')}
                  </span>
                </div>
              ) : (
                <div className={styles.warning}>
                  <AlertTriangle size={15} strokeWidth={1.9} />
                  <span>
                    {t('capture.archiveWarning')}
                  </span>
                </div>
              )}
            </div>

            {format === 'har' ? (
              <>
                <div className={styles.field}>
                  <span className={styles.label}>{t('capture.scope')}</span>
                  <div className={styles.radios}>
                    <ScopeOption
                      label={t('capture.allTraffic')}
                      count={allCount}
                      active={scope === 'all'}
                      onClick={() => setScope('all')}
                    />
                    <ScopeOption
                      label={t('capture.currentFilter')}
                      detail={formatFilter(filter, t('capture.noActiveFilter'))}
                      count={visibleCount}
                      active={scope === 'filter'}
                      onClick={() => setScope('filter')}
                    />
                    <ScopeOption
                      label={t('capture.selectedRequest')}
                      count={selectedId ? 1 : 0}
                      active={scope === 'selected'}
                      disabled={!selectedId}
                      onClick={() => setScope('selected')}
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <span className={styles.label}>{t('capture.redaction')}</span>
                  <div className={styles.checks}>
                    <CheckOption
                      checked={authorization}
                      label={t('capture.maskAuthorization')}
                      onChange={setAuthorization}
                    />
                    <CheckOption
                      checked={cookies}
                      label={t('capture.maskCookies')}
                      onChange={setCookies}
                    />
                    <CheckOption
                      checked={bodies}
                      label={t('capture.stripBodies')}
                      onChange={setBodies}
                    />
                  </div>
                </div>
              </>
            ) : null}
            {warnBeforeUnmasked &&
            (format === 'archive' || !authorization || !cookies) ? (
              <div className={cx(styles.warning, styles.dangerWarning)}>
                <AlertTriangle size={15} strokeWidth={1.9} />
                <span>
                  {format === 'archive'
                    ? t('capture.archiveSensitiveWarning')
                    : t('capture.harSensitiveWarning')}
                </span>
              </div>
            ) : null}
            {error ? <div className={styles.error}>{error}</div> : null}
          </div>
        )}

        <footer className={styles.footer}>
          {job ? (
            <>
              {running ? (
                <Button variant="danger" onClick={() => void cancel()}>
                  {t('capture.cancelTransfer')}
                </Button>
              ) : (
                <Button onClick={close}>{t('capture.close')}</Button>
              )}
            </>
          ) : (
            <>
              <Button onClick={close}>{t('capture.cancel')}</Button>
              <Button
                icon={Upload}
                disabled={submitting}
                onClick={() => void startImport()}
              >
                {format === 'archive' ? t('capture.importArchive') : t('capture.importHar')}
              </Button>
              <Button
                icon={Download}
                variant="primary"
                disabled={submitting || (format === 'har' && exportCount === 0)}
                onClick={() => void startExport()}
              >
                {format === 'archive'
                  ? t('capture.exportArchive')
                  : t('capture.exportRequestCount', { count: exportCount })}
              </Button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}

interface ScopeOptionProps {
  label: string;
  detail?: string;
  count: number | string;
  active: boolean;
  disabled?: boolean;
  onClick(): void;
}

function ScopeOption({
  label,
  detail,
  count,
  active,
  disabled = false,
  onClick,
}: ScopeOptionProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={cx(styles.scope, active && styles.scopeActive)}
      disabled={disabled}
      onClick={onClick}
    >
      <span className={styles.radio} />
      <span className={styles.scopeCopy}>
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      <span className={styles.count}>{count}</span>
    </button>
  );
}

interface CheckOptionProps {
  checked: boolean;
  label: string;
  onChange(checked: boolean): void;
}

function CheckOption({
  checked,
  label,
  onChange,
}: CheckOptionProps): React.JSX.Element {
  return (
    <label className={styles.check}>
      <Checkbox checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

function JobProgress({
  job,
  error,
}: {
  job: TransferJobSnapshot;
  error: string | null;
}): React.JSX.Element {
  const { t } = useTranslation();
  const percent = job.total > 0
    ? Math.min(100, Math.round((job.processed / job.total) * 100))
    : job.state === 'completed'
      ? 100
      : 0;
  const StatusIcon = job.state === 'completed' ? CheckCircle2 : XCircle;
  return (
    <div className={styles.job} aria-live="polite">
      <div className={styles.jobHeading}>
        {job.state === 'running' ? (
          <span className={styles.spinner} />
        ) : (
          <StatusIcon
            size={22}
            strokeWidth={1.9}
            className={job.state === 'completed' ? styles.success : styles.failed}
          />
        )}
        <div>
          <strong>{t(TRANSFER_HEADING_KEYS[job.kind])}</strong>
          <span>{job.fileName}</span>
        </div>
      </div>
      <div className={styles.progressTrack}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className={styles.progressMeta}>
        <span>
          {t(
            job.kind === 'archive-export'
              ? 'capture.processedFiles'
              : 'capture.processedRequests',
            { processed: job.processed, total: job.total },
          )}
        </span>
        <span>{percent}%</span>
      </div>
      {job.message ? <div className={styles.error}>{job.message}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}
      {job.warnings.map((warning) => (
        <div className={styles.warning} key={warning}>
          <AlertTriangle size={15} strokeWidth={1.9} />
          <span>{warning}</span>
        </div>
      ))}
    </div>
  );
}

function buildScope(
  kind: ExportScopeKind,
  selectedId: string | null,
  filter: ReturnType<typeof useCaptureStore.getState>['filter'],
): HarExportRequest['scope'] {
  if (kind === 'selected' && selectedId) {
    return { kind: 'selected', exchangeIds: [selectedId] };
  }
  if (kind === 'filter') {
    return {
      kind: 'filter',
      filter: {
        ...(filter.search ? { search: filter.search } : {}),
        ...(filter.method ? { method: filter.method } : {}),
        ...(filter.status !== null ? { status: filter.status } : {}),
        ...(filter.host ? { host: filter.host } : {}),
        ...(filter.segment !== 'all' ? { protocol: filter.segment } : {}),
      },
    };
  }
  return { kind: 'all' };
}

function formatFilter(
  filter: ReturnType<typeof useCaptureStore.getState>['filter'],
  emptyLabel: string,
): string {
  const parts = [
    filter.method ? `method:${filter.method}` : '',
    filter.status !== null ? `status:${filter.status}` : '',
    filter.host ? `host:${filter.host}` : '',
    filter.search ? `search:${filter.search}` : '',
    filter.segment !== 'all' ? `protocol:${filter.segment.toUpperCase()}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : emptyLabel;
}

function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

const TRANSFER_HEADING_KEYS: Record<TransferJobSnapshot['kind'], string> = {
  'har-import': 'capture.importingHar',
  'har-export': 'capture.exportingHar',
  'archive-import': 'capture.importingArchive',
  'archive-export': 'capture.exportingArchive',
  'diagnostics-export': 'capture.exportingDiagnostics',
};
