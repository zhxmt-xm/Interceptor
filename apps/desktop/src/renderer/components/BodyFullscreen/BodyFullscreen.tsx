import { Modal } from 'antd';
import { Copy, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '../IconButton/IconButton';

import styles from './BodyFullscreen.module.css';

export interface BodyFullscreenProps {
  /** 弹窗标题，如 Response body。 */
  title: string;
  /** 与工具条同源的 MIME + 尺寸摘要。 */
  meta: string;
  onCopy?: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

/** 正文全屏视图：把同一份 BodyViewer 内容搬进 1060×660 的弹窗。 */
export function BodyFullscreen({
  title,
  meta,
  onCopy,
  onClose,
  children,
}: BodyFullscreenProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Modal
      open
      centered
      width={1060}
      closable={false}
      footer={null}
      title={null}
      destroyOnHidden
      onCancel={onClose}
      classNames={{ container: styles.panel, body: styles.panelBody }}
      styles={{
        container: { padding: 0, border: '1px solid var(--border-2)' },
        body: { padding: 0, lineHeight: 1.23 },
      }}
      aria-label={title}
    >
      <header className={styles.head}>
        <b>{title}</b>
        <span className={styles.meta}>{meta}</span>
        <span className={styles.spacer} />
        {onCopy ? (
          <IconButton icon={Copy} label={t('common.copy')} size="sm" onClick={onCopy} />
        ) : null}
        <IconButton icon={X} label={t('body.exitFullscreen')} size="sm" onClick={onClose} />
      </header>
      <div className={styles.body}>{children}</div>
    </Modal>
  );
}
