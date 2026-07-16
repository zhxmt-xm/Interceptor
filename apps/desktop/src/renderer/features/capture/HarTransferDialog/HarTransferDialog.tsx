import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import type {
  HarExportRequest,
  TransferJobSnapshot,
} from '../../../../shared/desktop-api';
import { Button, Checkbox, cx } from '../../../components';
import { matchesSegment, useCaptureStore } from '../captureStore';
import { refetchSessions } from '../useCaptureData';
import styles from './HarTransferDialog.module.css';

const JOB_POLL_MS = 350;

type ExportScopeKind = HarExportRequest['scope']['kind'];

/** HAR 1.2 import/export options, progress, cancellation and completion overlay. */
export function HarTransferDialog(): React.JSX.Element | null {
  const open = useCaptureStore((state) => state.harDialogOpen);
  const rows = useCaptureStore((state) => state.rows);
  const selectedId = useCaptureStore((state) => state.selectedId);
  const filter = useCaptureStore((state) => state.filter);
  const hasMore = useCaptureStore((state) => state.hasMore);
  const setOpen = useCaptureStore((state) => state.setHarDialogOpen);
  const [scope, setScope] = useState<ExportScopeKind>('filter');
  const [authorization, setAuthorization] = useState(true);
  const [cookies, setCookies] = useState(true);
  const [bodies, setBodies] = useState(false);
  const [job, setJob] = useState<TransferJobSnapshot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allCount, setAllCount] = useState(rows.length);

  const visibleCount = rows.filter((row) =>
    matchesSegment(row, filter.segment)).length;
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
        } else if (next.state === 'completed' && next.kind === 'har-import') {
          await refetchSessions();
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
    if (scope === 'selected' && !selectedId) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const request: HarExportRequest = {
        scope: buildScope(scope, selectedId, filter),
        redaction: { authorization, cookies, bodies },
      };
      const started = await window.interceptor.startHarExport(request);
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
      const started = await window.interceptor.startHarImport();
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
          <h2 id="har-transfer-title">HAR import / export</h2>
          <button
            type="button"
            className={styles.close}
            aria-label="Close HAR import and export"
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
              <span className={styles.label}>Format</span>
              <div className={styles.segmented}>
                <span className={styles.segmentActive}>HAR 1.2</span>
                <span className={styles.segmentDisabled}>Native archive</span>
              </div>
              <div className={styles.warning}>
                <AlertTriangle size={15} strokeWidth={1.9} />
                <span>
                  HAR omits HTTP/2 pseudo-headers and trailers, WebSocket
                  messages, TLS detail, and rule history.
                </span>
              </div>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Scope</span>
              <div className={styles.radios}>
                <ScopeOption
                  label="All traffic"
                  count={allCount}
                  active={scope === 'all'}
                  onClick={() => setScope('all')}
                />
                <ScopeOption
                  label="Current filter"
                  detail={formatFilter(filter)}
                  count={hasMore ? `${visibleCount}+` : visibleCount}
                  active={scope === 'filter'}
                  onClick={() => setScope('filter')}
                />
                <ScopeOption
                  label="Selected request"
                  count={selectedId ? 1 : 0}
                  active={scope === 'selected'}
                  disabled={!selectedId}
                  onClick={() => setScope('selected')}
                />
              </div>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Redaction</span>
              <div className={styles.checks}>
                <CheckOption
                  checked={authorization}
                  label="Mask authorization tokens"
                  onChange={setAuthorization}
                />
                <CheckOption
                  checked={cookies}
                  label="Mask cookies & Set-Cookie"
                  onChange={setCookies}
                />
                <CheckOption
                  checked={bodies}
                  label="Strip request/response bodies"
                  onChange={setBodies}
                />
              </div>
            </div>
            {error ? <div className={styles.error}>{error}</div> : null}
          </div>
        )}

        <footer className={styles.footer}>
          {job ? (
            <>
              {running ? (
                <Button variant="danger" onClick={() => void cancel()}>
                  Cancel transfer
                </Button>
              ) : (
                <Button onClick={close}>Close</Button>
              )}
            </>
          ) : (
            <>
              <Button onClick={close}>Cancel</Button>
              <Button
                icon={Upload}
                disabled={submitting}
                onClick={() => void startImport()}
              >
                Import HAR
              </Button>
              <Button
                icon={Download}
                variant="primary"
                disabled={submitting || exportCount === 0}
                onClick={() => void startExport()}
              >
                {scope === 'filter' && hasMore
                  ? 'Export filtered'
                  : `Export ${exportCount} ${exportCount === 1 ? 'request' : 'requests'}`}
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
          <strong>
            {job.kind === 'har-import' ? 'Importing HAR' : 'Exporting HAR'}
          </strong>
          <span>{job.fileName}</span>
        </div>
      </div>
      <div className={styles.progressTrack}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className={styles.progressMeta}>
        <span>{job.processed} of {job.total} requests</span>
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
): string {
  const parts = [
    filter.method ? `method:${filter.method}` : '',
    filter.status !== null ? `status:${filter.status}` : '',
    filter.host ? `host:${filter.host}` : '',
    filter.search ? `search:${filter.search}` : '',
    filter.segment !== 'all' ? `protocol:${filter.segment.toUpperCase()}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'No active filter';
}

function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
