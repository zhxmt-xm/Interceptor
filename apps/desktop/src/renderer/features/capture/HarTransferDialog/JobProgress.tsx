import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { TransferJobSnapshot } from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { TRANSFER_HEADING_KEYS } from '../constants';

import styles from './JobProgress.module.css';

export interface JobProgressProps {
  job: TransferJobSnapshot;
  /** IPC 层失败原因；与任务自身的 message 分开展示。 */
  error: string | null;
}

/** 文件任务的进度块：状态图标、进度条、计数与警告。 */
export function JobProgress({ job, error }: JobProgressProps): React.JSX.Element {
  const { t } = useTranslation();
  const percent = job.total > 0
    ? Math.min(100, Math.round((job.processed / job.total) * 100))
    : job.state === 'completed'
      ? 100
      : 0;
  const StatusIcon = job.state === 'completed' ? CheckCircle2 : XCircle;

  return (
    <div
      className={styles.job}
      aria-live="polite"
      data-automation-id={AUTOMATION_IDS.capture.transfer.progress}
      data-transfer-job-id={job.id}
      data-transfer-job-kind={job.kind}
      data-transfer-job-state={job.state}
      data-transfer-processed={job.processed}
      data-transfer-total={job.total}
    >
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
