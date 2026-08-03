import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { cx } from '../../../components';
import { useCaptureStore } from '../data/captureStore';
import styles from './CaptureStatusbar.module.css';

/**
 * Capture 状态栏只承载抓包链路：监听端点、系统代理接管与 HTTPS 解密。
 * 录制状态、Core 状态与计数分别归属工具栏和侧栏，不在这里重复。
 */
export function CaptureStatusbar(): React.JSX.Element {
  const { t } = useTranslation();
  const { endpoint, systemProxyOwned, decrypting } = useCaptureStore((state) => state.linkStatus);
  const setHttpsSetupOpen = useCaptureStore((state) => state.setHttpsSetupOpen);

  return (
    <div className={styles.bar}>
      <span className={styles.slot} data-parity="capture-status-endpoint">
        <span className={cx(styles.dot, systemProxyOwned ? styles.dotOk : styles.dotWarn)} />
        {endpoint ? `${endpoint.host}:${endpoint.port}` : t('capture.listenerStopped')}
        <span className={styles.proxyLabel}>
          {systemProxyOwned ? t('capture.systemProxyOn') : t('capture.systemProxyOff')}
        </span>
      </span>

      <span className={styles.slot}>
        {decrypting ? (
          <span className={styles.decrypting} data-parity="capture-status-decrypting">
            <Lock className={styles.lockOpen} size={12} strokeWidth={2.2} />
            {t('capture.httpsDecrypting')}
          </span>
        ) : (
          <>
            <span className={styles.passthrough} data-parity="capture-status-passthrough">
              <LockOffIcon className={styles.lockClosed} />
              {t('capture.httpsPassthrough')}
            </span>
            <button
              type="button"
              className={styles.link}
              onClick={() => setHttpsSetupOpen(true)}
              title={t('capture.enableMitmHint')}
              data-automation-id={AUTOMATION_IDS.capture.enableMitm}
            >
              {t('capture.clickToEnableMitm')}
            </button>
          </>
        )}
      </span>

      <span className={styles.slotEnd} />
    </div>
  );
}

/**
 * Lucide 没有划线锁（lock 只有开/闭两态），因此用官方 lock 路径加一道斜杠。
 * 斜杠下的背景色垫线模拟 Lucide *-off 图标那种截断间隙，否则 12px 下三层线条会糊成一团。
 */
function LockOffIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      className={className}
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <line x1="1.3" y1="22.7" x2="21.5" y2="2.5" stroke="var(--chrome)" strokeWidth={5} />
      <line x1="1.8" y1="22.2" x2="21" y2="3" />
    </svg>
  );
}
