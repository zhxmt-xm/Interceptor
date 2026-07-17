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
    void startFirstCapture(useSystemProxy)
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
          <b>Set up Interceptor</b>
        </header>

        <div className={styles.steps} aria-label="Setup progress">
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
                <span className={styles.stepName}>{stepLabel(item)}</span>
              </span>
            </Fragment>
          ))}
        </div>

        {step === 'welcome' ? (
          <WizardBody icon={Zap} title="Welcome to Interceptor">
            <p>
              A local HTTP/HTTPS debugging proxy. Inspect, map, rewrite and replay
              traffic. Everything runs on your machine.
            </p>
            <div className={styles.consent}>
              <span className={styles.consentCheck}><Check aria-hidden="true" /></span>
              <span>
                Capture stays <b>off</b> until you press Start. Nothing is recorded
                or decrypted without your consent.
              </span>
            </div>
            <WizardFooter alignEnd>
              <Button
                icon={ArrowRight}
                iconPosition="end"
                variant="primary"
                onClick={() => goTo('proxy')}
              >
                Get started
              </Button>
            </WizardFooter>
          </WizardBody>
        ) : null}

        {step === 'proxy' ? (
          <WizardBody icon={Wifi} title="Route traffic through Interceptor">
            <p>
              Point your system or app at the local proxy. Interceptor can set the
              system proxy automatically and restore it on exit.
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
                  <b>{systemProxy?.supported ? 'System proxy ready' : 'Automatic setup unavailable'}</b>
                  <span>
                    {systemProxy?.supported
                      ? 'enabled on Start · restored on exit'
                      : 'configure the application proxy manually'}
                  </span>
                </span>
                <StatusBadge tone={systemProxy?.supported ? 'green' : 'yellow'}>
                  {systemProxy?.supported ? (useSystemProxy ? 'Ready' : 'Off') : 'Manual'}
                </StatusBadge>
              </button>
              <div className={styles.cardRow}>
                <StateIcon state="current" icon={Wifi} />
                <span className={styles.cardCaption}>
                  <b>Manual proxy address</b>
                  <span>{WIZARD_PROXY_HOST}:{WIZARD_PROXY_PORT}</span>
                </span>
                <Button
                  icon={Copy}
                  onClick={() => void navigator.clipboard?.writeText(
                    `${WIZARD_PROXY_HOST}:${WIZARD_PROXY_PORT}`,
                  )}
                >
                  Copy
                </Button>
              </div>
            </div>
            <ErrorMessage message={error} />
            <WizardFooter>
              <Button onClick={() => goTo('welcome')}>Back</Button>
              <Button
                icon={ArrowRight}
                iconPosition="end"
                variant="primary"
                disabled={systemProxy === null}
                onClick={() => goTo('ca')}
              >
                Continue
              </Button>
            </WizardFooter>
          </WizardBody>
        ) : null}

        {step === 'ca' ? (
          <WizardBody icon={Shield} title="Trust the Interceptor CA">
            <p>
              To decrypt HTTPS, install and trust the local root certificate.
              Trust is only ever installed with your explicit consent.
            </p>
            <div className={styles.card}>
              <div className={styles.cardRow}>
                <StateIcon state={certificate?.present ? 'done' : 'current'} icon={Shield} />
                <span className={styles.cardCaption}>
                  <b>Root CA generated on this device</b>
                  <span>{certificate?.fingerprint ?? 'not generated'}</span>
                </span>
                {certificate?.present ? (
                  <StatusBadge>Done</StatusBadge>
                ) : (
                  <Button
                    variant="primary"
                    disabled={busy || certificate === null}
                    onClick={generateCertificate}
                  >
                    Generate
                  </Button>
                )}
              </div>
              <div className={styles.cardRow}>
                <StateIcon state={certificate?.trusted ? 'done' : certificate?.present ? 'current' : 'todo'} icon={LockKeyhole} />
                <span className={styles.cardCaption}>
                  <b>Install to local trust store</b>
                  <span>explicit OS authorization required</span>
                </span>
                {certificate?.trusted ? (
                  <StatusBadge>Done</StatusBadge>
                ) : (
                  <Button
                    icon={Shield}
                    variant="primary"
                    disabled={busy || !certificate?.present || !certificate.supported}
                    onClick={installCertificate}
                  >
                    Install
                  </Button>
                )}
              </div>
              <div className={styles.cardRow}>
                <StateIcon state={certificate?.trusted ? 'done' : 'todo'} icon={Check} />
                <span className={styles.cardCaption}>
                  <b>Verify trust</b>
                  <span>{certificate?.trusted ? 'certificate is trusted' : 'waiting for trust installation'}</span>
                </span>
              </div>
            </div>
            <ErrorMessage message={error} />
            <WizardFooter>
              <Button onClick={() => goTo('proxy')}>Back</Button>
              <Button
                icon={ArrowRight}
                iconPosition="end"
                variant="primary"
                disabled={busy || !certificate?.trusted}
                onClick={() => goTo('ready')}
              >
                Continue
              </Button>
            </WizardFooter>
          </WizardBody>
        ) : null}

        {step === 'ready' ? (
          <WizardBody icon={Check} iconTone="success" title="You're all set">
            <p>
              Interceptor is ready to capture. Start capturing to see live traffic,
              then add rules to map, rewrite or block.
            </p>
            <div className={styles.card}>
              <div className={styles.cardRow}>
                <StateIcon state="done" icon={Check} />
                <span className={styles.cardCaption}><b>Proxy configured</b></span>
                <span className={styles.mono}>{WIZARD_PROXY_HOST}:{WIZARD_PROXY_PORT}</span>
              </div>
              <div className={styles.cardRow}>
                <StateIcon state="done" icon={Check} />
                <span className={styles.cardCaption}><b>CA trusted</b></span>
                <StatusBadge>MITM ready</StatusBadge>
              </div>
            </div>
            <ErrorMessage message={error} />
            <WizardFooter>
              <Button onClick={() => goTo('ca')}>Back</Button>
              <Button
                icon={Activity}
                variant="primary"
                disabled={busy}
                onClick={startCapture}
              >
                {busy ? 'Starting…' : 'Start capturing'}
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
function stepLabel(step: FirstRunStep): string {
  switch (step) {
    case 'welcome': return 'Welcome';
    case 'proxy': return 'Proxy';
    case 'ca': return 'Trust CA';
    case 'ready': return 'Ready';
  }
}

/** Start the first listener and apply system routing only after it is live. */
async function startFirstCapture(useSystemProxy: boolean): Promise<void> {
  const api = window.interceptor;
  const status = await api.startCapture(WIZARD_PROXY_PORT);
  if (!status.listening || !status.host || !status.port) {
    throw new Error('The local proxy did not start.');
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