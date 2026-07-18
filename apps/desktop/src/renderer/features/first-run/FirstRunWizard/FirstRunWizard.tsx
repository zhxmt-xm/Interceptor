import {
  Activity,
  ArrowRight,
  Check,
  Copy,
  LockKeyhole,
  Shield,
  Wifi,
  Zap,
} from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  CertificateInfo,
  SystemProxyStatus,
} from '../../../../shared/desktop-api';
import { Button, cx, StatusBadge } from '../../../components';
import { useCaptureStore } from '../../capture/captureStore';
import styles from './FirstRunWizard.module.css';

const FIRST_RUN_STORAGE_KEY = 'interceptor.first-run';
const WIZARD_PROXY_HOST = '127.0.0.1';
const WIZARD_PROXY_PORT = 8888;
const STEPS = ['welcome', 'proxy', 'ca', 'ready'] as const;

type FirstRunStep = (typeof STEPS)[number];

export interface FirstRunWizardProps {
  onComplete: () => void;
}

/** First-run setup for explicit proxy routing, CA trust and the first capture. */
export function FirstRunWizard({ onComplete }: FirstRunWizardProps): React.JSX.Element {
  const { t } = useTranslation();
  const [step, setStep] = useState<FirstRunStep>('welcome');
  const [systemProxy, setSystemProxy] = useState<SystemProxyStatus | null>(null);
  const [useSystemProxy, setUseSystemProxy] = useState(false);
  const [certificate, setCertificate] = useState<CertificateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const api = window.interceptor;
    void Promise.all([
      api.getSystemProxyStatus(),
      api.getCertificateStatus(),
    ])
      .then(([nextSystemProxy, nextCertificate]) => {
        if (!active) {
          return;
        }
        setSystemProxy(nextSystemProxy);
        setUseSystemProxy(nextSystemProxy.supported);
        setCertificate(nextCertificate);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(describeError(reason));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const currentIndex = STEPS.indexOf(step);
  const goTo = (next: FirstRunStep): void => {
    setError(null);
    setStep(next);
  };

  const generateCertificate = (): void => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    void window.interceptor.generateCertificate()
      .then(setCertificate)
      .catch((reason: unknown) => setError(describeError(reason)))
      .finally(() => setBusy(false));
  };

  const installCertificate = (): void => {
    if (busy || !certificate?.present) {
      return;
    }
    setBusy(true);
    setError(null);
    void window.interceptor.installCertificate()
      .then(setCertificate)
      .catch((reason: unknown) => setError(describeError(reason)))
      .finally(() => setBusy(false));
  };

  const startCapture = (): void => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    void startFirstCapture(useSystemProxy, t('firstRun.proxyDidNotStart'))
      .then(() => {
        window.localStorage.setItem(FIRST_RUN_STORAGE_KEY, 'completed');
        onComplete();
      })
      .catch((reason: unknown) => setError(describeError(reason)))
      .finally(() => setBusy(false));
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="first-run-title">
      <section className={styles.wizard}>
        <header className={styles.header}>
          <span className={styles.logo}><Zap aria-hidden="true" /></span>
          <b>{t('firstRun.setup')}</b>
        </header>

        <div className={styles.steps} aria-label={t('firstRun.setupProgress')}>
          {STEPS.map((item, index) => (
            <Fragment key={item}>
              {index > 0 ? (
                <span className={cx(styles.stepLine, index <= currentIndex && styles.done)} />
              ) : null}
              <span
                className={cx(
                  styles.step,
                  index < currentIndex && styles.done,
                  index === currentIndex && styles.current,
                )}
                aria-current={index === currentIndex ? 'step' : undefined}
              >
                <span className={styles.stepNumber}>
                  {index < currentIndex ? <Check aria-hidden="true" /> : index + 1}
                </span>
                <span className={styles.stepName}>{stepLabel(item, (key) => t(key))}</span>
              </span>
            </Fragment>
          ))}
        </div>

        {step === 'welcome' ? (
          <WizardBody icon={Zap} title={t('firstRun.welcomeTitle')}>
            <p>
              {t('firstRun.welcomeDescription')}
            </p>
            <div className={styles.consent}>
              <span className={styles.consentCheck}><Check aria-hidden="true" /></span>
              <span>
                {t('firstRun.captureStays')} <b>{t('firstRun.off')}</b>{' '}
                {t('firstRun.captureConsent')}
              </span>
            </div>
            <WizardFooter alignEnd>
              <Button
                icon={ArrowRight}
                iconPosition="end"
                variant="primary"
                onClick={() => goTo('proxy')}
              >
                {t('firstRun.getStarted')}
              </Button>
            </WizardFooter>
          </WizardBody>
        ) : null}

        {step === 'proxy' ? (
          <WizardBody icon={Wifi} title={t('firstRun.routeTitle')}>
            <p>
              {t('firstRun.routeDescription')}
            </p>
            <div className={styles.card}>
              <button
                type="button"
                role="checkbox"
                aria-checked={useSystemProxy}
                className={styles.cardRowButton}
                disabled={!systemProxy?.supported}
                onClick={() => setUseSystemProxy((value) => !value)}
              >
                <StateIcon state={systemProxy?.supported && useSystemProxy ? 'done' : 'todo'} icon={Check} />
                <span className={styles.cardCaption}>
                  <b>{systemProxy?.supported ? t('firstRun.systemProxyReady') : t('firstRun.automaticUnavailable')}</b>
                  <span>
                    {systemProxy?.supported
                      ? t('firstRun.enabledOnStart')
                      : t('firstRun.configureManually')}
                  </span>
                </span>
                <StatusBadge tone={systemProxy?.supported ? 'green' : 'yellow'}>
                  {systemProxy?.supported ? (useSystemProxy ? t('firstRun.ready') : t('firstRun.off')) : t('firstRun.manual')}
                </StatusBadge>
              </button>
              <div className={styles.cardRow}>
                <StateIcon state="current" icon={Wifi} />
                <span className={styles.cardCaption}>
                  <b>{t('firstRun.manualProxyAddress')}</b>
                  <span>{WIZARD_PROXY_HOST}:{WIZARD_PROXY_PORT}</span>
                </span>
                <Button
                  icon={Copy}
                  onClick={() => void navigator.clipboard?.writeText(
                    `${WIZARD_PROXY_HOST}:${WIZARD_PROXY_PORT}`,
                  )}
                >
                  {t('firstRun.copy')}
                </Button>
              </div>
            </div>
            <ErrorMessage message={error} />
            <WizardFooter>
              <Button onClick={() => goTo('welcome')}>{t('firstRun.back')}</Button>
              <Button
                icon={ArrowRight}
                iconPosition="end"
                variant="primary"
                disabled={systemProxy === null}
                onClick={() => goTo('ca')}
              >
                {t('firstRun.continue')}
              </Button>
            </WizardFooter>
          </WizardBody>
        ) : null}

        {step === 'ca' ? (
          <WizardBody icon={Shield} title={t('firstRun.trustTitle')}>
            <p>
              {t('firstRun.trustDescription')}
            </p>
            <div className={styles.card}>
              <div className={styles.cardRow}>
                <StateIcon state={certificate?.present ? 'done' : 'current'} icon={Shield} />
                <span className={styles.cardCaption}>
                  <b>{t('firstRun.rootGenerated')}</b>
                  <span>{certificate?.fingerprint ?? t('firstRun.notGenerated')}</span>
                </span>
                {certificate?.present ? (
                  <StatusBadge>{t('firstRun.done')}</StatusBadge>
                ) : (
                  <Button
                    variant="primary"
                    disabled={busy || certificate === null}
                    onClick={generateCertificate}
                  >
                    {t('firstRun.generate')}
                  </Button>
                )}
              </div>
              <div className={styles.cardRow}>
                <StateIcon state={certificate?.trusted ? 'done' : certificate?.present ? 'current' : 'todo'} icon={LockKeyhole} />
                <span className={styles.cardCaption}>
                  <b>{t('firstRun.installTrustStore')}</b>
                  <span>{t('firstRun.explicitAuthorization')}</span>
                </span>
                {certificate?.trusted ? (
                  <StatusBadge>{t('firstRun.done')}</StatusBadge>
                ) : (
                  <Button
                    icon={Shield}
                    variant="primary"
                    disabled={busy || !certificate?.present || !certificate.supported}
                    onClick={installCertificate}
                  >
                    {t('firstRun.install')}
                  </Button>
                )}
              </div>
              <div className={styles.cardRow}>
                <StateIcon state={certificate?.trusted ? 'done' : 'todo'} icon={Check} />
                <span className={styles.cardCaption}>
                  <b>{t('firstRun.verifyTrust')}</b>
                  <span>{certificate?.trusted ? t('firstRun.certificateTrusted') : t('firstRun.waitingForTrust')}</span>
                </span>
              </div>
            </div>
            <ErrorMessage message={error} />
            <WizardFooter>
              <Button onClick={() => goTo('proxy')}>{t('firstRun.back')}</Button>
              <Button
                icon={ArrowRight}
                iconPosition="end"
                variant="primary"
                disabled={busy || !certificate?.trusted}
                onClick={() => goTo('ready')}
              >
                {t('firstRun.continue')}
              </Button>
            </WizardFooter>
          </WizardBody>
        ) : null}

        {step === 'ready' ? (
          <WizardBody icon={Check} iconTone="success" title={t('firstRun.allSetTitle')}>
            <p>
              {t('firstRun.allSetDescription')}
            </p>
            <div className={styles.card}>
              <div className={styles.cardRow}>
                <StateIcon state="done" icon={Check} />
                <span className={styles.cardCaption}><b>{t('firstRun.proxyConfigured')}</b></span>
                <span className={styles.mono}>{WIZARD_PROXY_HOST}:{WIZARD_PROXY_PORT}</span>
              </div>
              <div className={styles.cardRow}>
                <StateIcon state="done" icon={Check} />
                <span className={styles.cardCaption}><b>{t('firstRun.caTrusted')}</b></span>
                <StatusBadge>{t('firstRun.mitmReady')}</StatusBadge>
              </div>
            </div>
            <ErrorMessage message={error} />
            <WizardFooter>
              <Button onClick={() => goTo('ca')}>{t('firstRun.back')}</Button>
              <Button
                icon={Activity}
                variant="primary"
                disabled={busy}
                onClick={startCapture}
              >
                {busy ? t('firstRun.starting') : t('firstRun.startCapturing')}
              </Button>
            </WizardFooter>
          </WizardBody>
        ) : null}
      </section>
    </div>
  );
}

interface WizardBodyProps {
  icon: typeof Zap;
  iconTone?: 'default' | 'success';
  title: string;
  children: React.ReactNode;
}

/** Shared visual body for one setup step. */
function WizardBody({ icon: Icon, iconTone = 'default', title, children }: WizardBodyProps): React.JSX.Element {
  return (
    <div className={styles.body}>
      <span className={cx(styles.heroIcon, iconTone === 'success' && styles.success)}>
        <Icon aria-hidden="true" />
      </span>
      <h1 id="first-run-title">{title}</h1>
      {children}
    </div>
  );
}

interface WizardFooterProps {
  alignEnd?: boolean;
  children: React.ReactNode;
}

/** Navigation footer shared by all setup steps. */
function WizardFooter({ alignEnd = false, children }: WizardFooterProps): React.JSX.Element {
  return <footer className={cx(styles.footer, alignEnd && styles.alignEnd)}>{children}</footer>;
}

interface StateIconProps {
  state: 'done' | 'current' | 'todo';
  icon: typeof Check;
}

/** Circular setup-row state marker. */
function StateIcon({ state, icon: Icon }: StateIconProps): React.JSX.Element {
  return (
    <span className={cx(styles.stateIcon, styles[state])}>
      <Icon aria-hidden="true" />
    </span>
  );
}

/** Inline bounded error message for retryable setup actions. */
function ErrorMessage({ message }: { message: string | null }): React.JSX.Element | null {
  return message ? <div className={styles.error} role="alert">{message}</div> : null;
}

/** Stable display label for one setup step. */
function stepLabel(step: FirstRunStep, translate: (key: string) => string): string {
  switch (step) {
    case 'welcome': return translate('firstRun.stepWelcome');
    case 'proxy': return translate('firstRun.stepProxy');
    case 'ca': return translate('firstRun.stepTrustCa');
    case 'ready': return translate('firstRun.stepReady');
  }
}

/** Start the first listener and apply system routing only after it is live. */
async function startFirstCapture(
  useSystemProxy: boolean,
  proxyDidNotStartMessage: string,
): Promise<void> {
  const api = window.interceptor;
  const status = await api.startCapture(WIZARD_PROXY_PORT);
  if (!status.listening || !status.host || !status.port) {
    throw new Error(proxyDidNotStartMessage);
  }
  useCaptureStore.getState().setCapturing(true);
  useCaptureStore.getState().setLive(true);
  if (!useSystemProxy) {
    return;
  }
  try {
    await api.enableSystemProxy();
  } catch (error) {
    await api.restoreSystemProxy().catch(() => undefined);
    await api.stopCapture().catch(() => undefined);
    useCaptureStore.getState().setCapturing(false);
    throw error;
  }
}

/** Convert unknown IPC failures to bounded user-visible text. */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 512);
}

/** Whether this profile has already completed the first-run flow. */
export function hasCompletedFirstRun(): boolean {
  return window.localStorage.getItem(FIRST_RUN_STORAGE_KEY) === 'completed';
}