import { Modal } from 'antd';
import { Copy, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { IconButton } from '../IconButton/IconButton';
import styles from './BodyFullscreenDesign.module.css';

interface BodyFullscreenDesignProps {
  readonly title: string;
  readonly meta: string;
  readonly onCopy: () => void;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function BodyFullscreenDesign({ title, meta, onCopy, onClose, children }: BodyFullscreenDesignProps): React.JSX.Element {
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
      classNames={{ container: styles.bodyFullscreenDesign, body: styles.bodyFullscreenDesignBody }}
      styles={{ container: { padding: 0, border: '1px solid var(--border-2)' }, body: { padding: 0, lineHeight: 1.23 } }}
      aria-label={title}
    >
      <header className={styles.bodyFullscreenDesignHeader}>
        <b>{title}</b>
        <span className={styles.bodyFullscreenDesignMeta}>{meta}</span>
        <span className={styles.bodyFullscreenDesignSpacer} />
        <IconButton label="Copy body" icon={<Copy aria-hidden="true" />} onClick={onCopy} />
        <IconButton label="Exit fullscreen" icon={<X aria-hidden="true" />} onClick={onClose} />
      </header>
      <div className={styles.bodyFullscreenDesignContent}>{children}</div>
    </Modal>
  );
}