import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { AutomationId } from '../../../shared/automation-ids';
import styles from './FileTransferBusyOverlay.module.css';

interface FileTransferBusyOverlayProps {
  readonly open: boolean;
  readonly title: string;
  readonly detail: string;
  readonly automationId: AutomationId;
}

/** 不可关闭的文件操作遮罩；覆盖原生对话框返回后的读写与解析窗口。 */
export function FileTransferBusyOverlay({
  open,
  title,
  detail,
  automationId,
}: FileTransferBusyOverlayProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    panelRef.current?.focus();
    const blockKeyboard = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', blockKeyboard, true);
    return () => {
      window.removeEventListener('keydown', blockKeyboard, true);
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }
  return (
    <div
      className={styles.overlay}
      data-automation-id={automationId}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="status"
        aria-live="polite"
        aria-busy="true"
        tabIndex={-1}
      >
        <Loader2 aria-hidden="true" />
        <div>
          <strong>{title}</strong>
          <span>{detail}</span>
        </div>
      </div>
    </div>
  );
}
