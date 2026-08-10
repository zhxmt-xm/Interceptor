import { ArrowRight, Lock, Pause } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { cx } from '../../../components';
import { useBreakpointsStore } from '../../breakpoints';
import { useCaptureStore } from '../data/captureStore';
import styles from './CaptureStatusbar.module.css';
import { LockOffIcon } from './LockOffIcon';

/**
 * Capture 状态栏只承载抓包链路：监听端点、系统代理接管、HTTPS 解密、挂起与上游转发。
 * 录制状态、Core 状态与计数分别归属工具栏和侧栏，不在这里重复。
 */
export function CaptureStatusbar(): React.JSX.Element {
  const { t } = useTranslation();
  const { endpoint, systemProxyOwned, decrypting, upstream, upstreamReachable } = useCaptureStore(
    (state) => state.linkStatus,
  );
  const setHttpsSetupOpen = useCaptureStore((state) => state.setHttpsSetupOpen);
  const pausedCount = useBreakpointsStore((state) => state.breakpoints.length);
  const autoContinued = useBreakpointsStore((state) => state.autoContinued);

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

      <span className={cx(styles.slot, styles.slotEnd)}>
        {pausedCount > 0 || autoContinued > 0 ? (
          <span className={styles.paused} data-parity="capture-status-breakpoints">
            <Pause size={12} strokeWidth={2.2} />
            {t('breakpoints.pausedCount', { count: pausedCount })}
            {autoContinued > 0
              ? ` · ${t('breakpoints.autoContinued', { count: autoContinued })}`
              : ''}
          </span>
        ) : null}
        <span
          className={cx(styles.upstream, upstreamReachable ? undefined : styles.upstreamDown)}
          data-parity="capture-status-upstream"
          title={
            upstreamReachable
              ? undefined
              : t('capture.upstreamDownHint', { authority: upstream ?? '' })
          }
        >
          <ArrowRight className={styles.upstreamIcon} size={12} strokeWidth={2} />
          {upstream && upstreamReachable
            ? `${t('capture.upstream')} ${upstream}`
            : t('capture.directConnection')}
        </span>
      </span>
    </div>
  );
}

/**
 * Lucide 没有划线锁（lock 只有开/闭两态），因此用官方 lock 路径加一道斜杠。
 * 斜杠下的背景色垫线模拟 Lucide *-off 图标那种截断间隙，否则 12px 下三层线条会糊成一团。
 */
