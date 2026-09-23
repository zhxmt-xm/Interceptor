import { RefreshCw, Terminal, Zap } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../shared/automation-ids';
import { Button } from '../../components';
import { WindowControls } from '../../components/WindowControls/WindowControls';
import { dismissProxyReadinessIssue, retryCaptureBootstrap } from '../../features/capture';
import { BOOT_STEPS, bootStepState, useBootStore } from '../bootStore';
import styles from './BootScreen.module.css';

/** How long the completed state stays on screen before the app takes over. */
const READY_DISMISS_MS = 420;

const PHASE_MESSAGE_KEYS = {
  platform: 'boot.preparingPlatform',
  certificate: 'boot.preparingCertificate',
  core: 'boot.startingCore',
  listener: 'boot.bindingListener',
  proxy: 'boot.enablingSystemProxy',
  ready: 'boot.ready',
} as const;

export interface BootScreenProps {
  /** Leaves the boot screen and opens the Diagnostics workspace. */
  onOpenDiagnostics?: () => void;
}

/**
 * Cold-start cover: Proxy Core → local listener → system proxy, all automatic.
 * Only the window controls stay reachable so a stuck startup is still closable.
 */
export function BootScreen({ onOpenDiagnostics }: BootScreenProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const phase = useBootStore((state) => state.phase);
  const failedStep = useBootStore((state) => state.failedStep);
  const detail = useBootStore((state) => state.detail);
  const dismissed = useBootStore((state) => state.dismissed);

  useEffect(() => {
    if (phase !== 'ready') {
      return;
    }
    const timer = window.setTimeout(() => useBootStore.getState().dismiss(), READY_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (dismissed) {
    return null;
  }

  const failed = phase === 'error';
  const enterApp = (): void => {
    dismissProxyReadinessIssue();
    useBootStore.getState().dismiss();
  };

  return (
    <div
      className={styles.boot}
      data-phase={phase}
      data-automation-id={AUTOMATION_IDS.shell.boot.screen}
    >
      <div className={styles.chrome}>
        <WindowControls />
      </div>

      <div className={styles.stage}>
        <div className={styles.splash}>
          <div className={styles.ringWrap}>
            <span className={styles.ringTrack} />
            <span className={styles.ring} />
            <span className={styles.logo}>
              <Zap size={46} strokeWidth={2} />
            </span>
          </div>

          <div className={styles.copy}>
            <b className={styles.wordmark}>Interceptor</b>
            <span className={styles.phase}>
              {failed ? detail ?? t('boot.failed') : t(PHASE_MESSAGE_KEYS[phase])}
            </span>
          </div>

          <div className={styles.dots}>
            {BOOT_STEPS.map((step) => (
              <span
                key={step}
                className={styles.dot}
                data-state={bootStepState(step, phase, failedStep)}
              />
            ))}
          </div>

          <div className={styles.gate}>
            <p className={styles.note}>
              {failed ? t('boot.settingsUnchanged') : t('boot.systemProxyDisclosure')}
            </p>
            {failed && onOpenDiagnostics ? (
              <div className={styles.actions}>
                <Button
                  icon={Terminal}
                  onClick={() => {
                    enterApp();
                    onOpenDiagnostics();
                  }}
                  automationId={AUTOMATION_IDS.shell.boot.openDiagnostics}
                >
                  {t('boot.openDiagnostics')}
                </Button>
                <Button
                  onClick={enterApp}
                  automationId={AUTOMATION_IDS.shell.boot.enterAnyway}
                >
                  {t('boot.enterAnyway')}
                </Button>
                <Button
                  variant="primary"
                  icon={RefreshCw}
                  onClick={retryCaptureBootstrap}
                  automationId={AUTOMATION_IDS.shell.boot.retry}
                >
                  {t('boot.retry')}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
