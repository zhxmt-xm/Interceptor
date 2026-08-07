import {
  Globe2,
  LockOpen,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  TlsPassthroughSettingsStatus,
} from '../../../../shared/desktop-api';
import {
  Button,
  IconButton,
  InputBox,
  StatusBadge,
} from '../../../components';
import { useTlsCompatibilityStore } from '../data/tlsCompatibilityStore';
import { describeError, isTlsPassthroughHostDraft } from '../utils';

import styles from './TlsPassthroughPanel.module.css';

type PanelState = 'loading' | 'ready' | 'error';

/** Persistent per-host TLS passthrough settings. */
export function TlsPassthroughPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<TlsPassthroughSettingsStatus | null>(null);
  const [state, setState] = useState<PanelState>('loading');
  const [draftHost, setDraftHost] = useState('');
  const [invalidDraft, setInvalidDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadGeneration = useRef(0);
  const settingsChangeSequence = useTlsCompatibilityStore(
    (value) => value.settingsChangeSequence,
  );

  const load = (): void => {
    const generation = ++loadGeneration.current;
    setError(null);
    void window.interceptor.getTlsPassthroughSettings()
      .then((nextSettings) => {
        if (generation !== loadGeneration.current) return;
        setSettings(nextSettings);
        setState('ready');
      })
      .catch((reason: unknown) => {
        if (generation !== loadGeneration.current) return;
        setError(describeError(reason));
        setState('error');
      });
  };

  useEffect(load, [settingsChangeSequence]);

  const replace = (
    hosts: string[],
    onSuccess?: (nextSettings: TlsPassthroughSettingsStatus) => void,
  ): void => {
    if (!settings || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    void window.interceptor.replaceTlsPassthroughSettings(settings.revision, hosts)
      .then((result) => {
        if (!result.ok) {
          setError(result.message);
          if (result.reason === 'conflict') {
            load();
          }
          return;
        }
        setSettings(result.settings);
        onSuccess?.(result.settings);
      })
      .catch((reason: unknown) => setError(describeError(reason)))
      .finally(() => setBusy(false));
  };

  const addDraft = (): void => {
    if (!settings) return;
    const host = draftHost.trim();
    if (!isTlsPassthroughHostDraft(host)) {
      setInvalidDraft(true);
      return;
    }
    setInvalidDraft(false);
    replace([...settings.hosts, host], () => setDraftHost(''));
  };

  const restartApplication = (): void => {
    if (busy || restarting) return;
    setRestarting(true);
    setError(null);
    void window.interceptor.restartApplication()
      .then(() => {
        setRestarting(false);
        load();
      })
      .catch((reason: unknown) => {
        setRestarting(false);
        setError(describeError(reason));
      });
  };

  if (state === 'loading') {
    return (
      <>
        <h2 className={styles.title}>{t('settings.tlsPassthrough.title')}</h2>
        <div className={styles.desc}>{t('settings.tlsPassthrough.loading')}</div>
      </>
    );
  }

  if (state === 'error' && !settings) {
    return (
      <>
        <h2 className={styles.title}>{t('settings.tlsPassthrough.title')}</h2>
        <div className={styles.desc}>{t('settings.tlsPassthrough.unavailable')}</div>
        {error ? <div className={styles.error} role="alert">{error}</div> : null}
      </>
    );
  }

  const patternCount = settings?.hosts.length ?? 0;

  return (
    <>
      <h2 className={styles.title}>
        {t('settings.tlsPassthrough.title')}
        <StatusBadge tone="yellow">
          {t('settings.tlsPassthrough.patternCount', { count: patternCount })}
        </StatusBadge>
      </h2>
      <div className={styles.desc}>{t('settings.tlsPassthrough.description')}</div>

      {settings?.restartRequired ? (
        <div className={styles.warning}>
          <RefreshCw aria-hidden="true" />
          <div>
            <b>{t('settings.tlsPassthrough.restartTitle')}</b>
            <span>{t('settings.tlsPassthrough.restartDescription')}</span>
          </div>
          <Button
            className={styles.restartButton}
            icon={RefreshCw}
            variant="primary"
            loading={restarting}
            disabled={busy}
            onClick={restartApplication}
          >
            {t('settings.tlsPassthrough.restartAction')}
          </Button>
        </div>
      ) : null}

      <div className={styles.addRow}>
        <label className={styles.inputLabel}>
          <span>{t('settings.tlsPassthrough.hostLabel')}</span>
          <InputBox
            className={invalidDraft ? styles.invalidInput : styles.input}
            value={draftHost}
            onValueChange={(value) => {
              setDraftHost(value);
              setInvalidDraft(false);
            }}
            placeholder="*.example.com"
            ariaLabel={t('settings.tlsPassthrough.hostLabel')}
          />
        </label>
        <Button
          icon={Plus}
          variant="primary"
          disabled={busy || restarting}
          onClick={addDraft}
        >
          {t('settings.tlsPassthrough.addHost')}
        </Button>
      </div>
      {invalidDraft ? (
        <div className={styles.validation} role="alert">
          <TriangleAlert aria-hidden="true" />
          {t('settings.tlsPassthrough.invalidHost')}
        </div>
      ) : null}

      <div className={styles.list}>
        <div className={styles.listHead}>
          <span>{t('settings.tlsPassthrough.groupTitle')}</span>
          <span>{t('settings.tlsPassthrough.matchedBefore')}</span>
        </div>
        {settings?.hosts.map((host) => (
          <div
            className={styles.row}
            key={host}
            data-parity={`tls-host-${host}`}
          >
            <span className={styles.hostIcon}><LockOpen aria-hidden="true" /></span>
            <div className={styles.hostCopy}>
              <div className={styles.hostName}>
                <code>{host}</code>
                {host === '*.wvd.microsoft.com' ? (
                  <span className={styles.recommended}>
                    {t('settings.tlsPassthrough.recommended')}
                  </span>
                ) : null}
              </div>
              <span>{t('settings.tlsPassthrough.encryptedHint')}</span>
            </div>
            <IconButton
              icon={Trash2}
              label={t('settings.tlsPassthrough.removeHost', { host })}
              size="sm"
              disabled={busy || restarting}
              onClick={() => replace(settings.hosts.filter((item) => item !== host))}
            />
          </div>
        ))}
        {patternCount === 0 ? (
          <div className={styles.empty}>
            <LockOpen aria-hidden="true" />
            <b>{t('settings.tlsPassthrough.emptyTitle')}</b>
            <span>{t('settings.tlsPassthrough.emptyHint')}</span>
          </div>
        ) : null}
      </div>

      <div className={styles.note}>
        <Globe2 aria-hidden="true" />
        <span>{t('settings.tlsPassthrough.upstreamHint')}</span>
      </div>
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
    </>
  );
}