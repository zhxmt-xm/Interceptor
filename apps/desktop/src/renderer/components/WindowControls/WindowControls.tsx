import { Tooltip } from 'antd';
import { Maximize2, Minus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../shared/automation-ids';
import styles from './WindowControls.module.css';

/** Frameless window chrome, used by both the app shell header and the boot screen. */
export function WindowControls(): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className={styles.windowControls}>
      <Tooltip title={t('app.minimizeWindow')} mouseEnterDelay={0.4}>
        <button
          type="button"
          className={styles.windowControl}
          aria-label={t('app.minimizeWindow')}
          onClick={() => void window.interceptor.minimizeWindow()}
          data-automation-id={AUTOMATION_IDS.shell.window.minimize}
        >
          <Minus size={15} strokeWidth={1.9} />
        </button>
      </Tooltip>
      <Tooltip title={t('app.toggleMaximizeWindow')} mouseEnterDelay={0.4}>
        <button
          type="button"
          className={styles.windowControl}
          aria-label={t('app.toggleMaximizeWindow')}
          onClick={() => void window.interceptor.toggleMaximizeWindow()}
          data-automation-id={AUTOMATION_IDS.shell.window.maximizeRestore}
        >
          <Maximize2 size={14} strokeWidth={1.9} />
        </button>
      </Tooltip>
      <Tooltip title={t('capture.close')} mouseEnterDelay={0.4}>
        <button
          type="button"
          className={styles.windowClose}
          aria-label={t('capture.close')}
          onClick={() => {
            void window.interceptor.closeApplication().catch(() => window.close());
          }}
          data-automation-id={AUTOMATION_IDS.shell.window.close}
        >
          <X size={15} strokeWidth={1.9} />
        </button>
      </Tooltip>
    </div>
  );
}
