import { Modal } from 'antd';
import { TriangleAlert, Upload, X } from 'lucide-react';

import type { TreeImportSkip } from '@interceptor/core-protocol';

import { IconButton } from '../IconButton/IconButton';
import { Button } from '../Button/Button';
import styles from './ImportConfirmDialog.module.css';

/** 跳过列表最多渲染的行数；恶意文件可能产生上万条，全量渲染会拖垮对话框。 */
const MAX_VISIBLE_SKIPPED = 20;

export interface ImportStat {
  readonly label: string;
  readonly value: number;
  readonly emphasis?: 'enabled' | 'skipped';
  readonly automationId: string;
}

interface ImportConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly summary: React.ReactNode;
  readonly fileName: string;
  readonly stats: readonly ImportStat[];
  readonly skipped: readonly TreeImportSkip[];
  readonly skippedTitle: string;
  readonly skippedMore: (count: number) => string;
  readonly describeReason: (reason: string) => string;
  readonly warning?: string;
  readonly cancelLabel: string;
  readonly confirmLabel: string;
  readonly confirmWidth: number;
  readonly confirmDisabled: boolean;
  readonly busy?: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly automationIds: {
    readonly dialog: string;
    readonly fileName: string;
    readonly skippedList: string;
    readonly cancel: string;
    readonly confirm: string;
  };
}

/** 导入确认对话框：写入之前告知将追加多少内容、哪些项被跳过及原因。 */
export function ImportConfirmDialog({
  open,
  title,
  summary,
  fileName,
  stats,
  skipped,
  skippedTitle,
  skippedMore,
  describeReason,
  warning,
  cancelLabel,
  confirmLabel,
  confirmWidth,
  confirmDisabled,
  busy = false,
  onCancel,
  onConfirm,
  automationIds,
}: ImportConfirmDialogProps): React.JSX.Element {
  const visibleSkipped = skipped.slice(0, MAX_VISIBLE_SKIPPED);
  const hiddenSkipped = skipped.length - visibleSkipped.length;

  return (
    <Modal
      open={open}
      centered
      width={540}
      closable={false}
      footer={null}
      title={null}
      destroyOnHidden
      mask={{ closable: !busy }}
      keyboard={!busy}
      onCancel={() => {
        if (!busy) onCancel();
      }}
      classNames={{ container: styles.dialog }}
      styles={{
        container: { padding: 0, border: '1px solid var(--border-2)' },
        body: { padding: 0, lineHeight: 1.23 },
      }}
      aria-labelledby="import-confirm-title"
    >
      <div data-automation-id={automationIds.dialog}>
        <header className={styles.header}>
          <span className={styles.icon}><Upload aria-hidden="true" /></span>
          <h2 id="import-confirm-title">{title}</h2>
          <IconButton icon={X} label={cancelLabel} size="sm" disabled={busy} onClick={onCancel} />
        </header>
        <div className={styles.content}>
          <p>{summary}</p>
          <div className={styles.file}>
            <span className={styles.fileName} data-automation-id={automationIds.fileName}>
              {fileName}
            </span>
          </div>
          <div
            className={styles.summary}
            style={{ '--import-stat-columns': stats.length } as React.CSSProperties}
          >
            {stats.map((stat) => (
              <div key={stat.automationId} className={styles.stat} data-emphasis={stat.emphasis}>
                <span>{stat.label}</span>
                <strong data-automation-id={stat.automationId}>{stat.value}</strong>
              </div>
            ))}
          </div>
          {skipped.length > 0 && (
            <div className={styles.skipped}>
              <div className={styles.skippedHead}>
                <TriangleAlert aria-hidden="true" />
                <span>{skippedTitle}</span>
              </div>
              <ul className={styles.skippedList} data-automation-id={automationIds.skippedList}>
                {visibleSkipped.map((item) => (
                  <li key={`${item.path}-${item.reason}`}>
                    <span className={styles.skippedPath}>{item.path}</span>
                    <span className={styles.skippedReason}>{describeReason(item.reason)}</span>
                  </li>
                ))}
              </ul>
              {hiddenSkipped > 0 && (
                <div className={styles.skippedMore}>{skippedMore(hiddenSkipped)}</div>
              )}
            </div>
          )}
          {warning && (
            <div className={styles.warning}>
              <TriangleAlert aria-hidden="true" />
              <span>{warning}</span>
            </div>
          )}
        </div>
        <footer
          className={styles.footer}
          style={{ '--import-confirm-width': `${confirmWidth}px` } as React.CSSProperties}
        >
          <Button automationId={automationIds.cancel} disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            className={styles.confirmButton}
            variant="primary"
            icon={Upload}
            disabled={confirmDisabled}
            loading={busy}
            automationId={automationIds.confirm}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
