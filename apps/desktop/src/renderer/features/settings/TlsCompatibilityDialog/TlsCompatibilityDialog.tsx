import { Modal } from 'antd';
import { LockOpen, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Checkbox, IconButton } from '../../../components';
import {
  TlsCompatibilityActions,
  useTlsCompatibilityStore,
} from '../data/tlsCompatibilityStore';
import {
  describeError,
  tlsCompatibilityReasonKey,
  tlsPassthroughPatternChoices,
} from '../utils';

import styles from './TlsCompatibilityDialog.module.css';

export interface TlsCompatibilityDialogProps {
  onOpenSettings(): void;
}

/** App-scope prompt listing every pending TLS interception compatibility host. */
export function TlsCompatibilityDialog({
  onOpenSettings,
}: TlsCompatibilityDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const compatibilityEvents = useTlsCompatibilityStore((state) => state.events);
  const dismissCompatibility = useTlsCompatibilityStore((state) => state.dismiss);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPatterns, setSelectedPatterns] = useState<ReadonlySet<string>>(new Set());
  // 只有首次见到的 host 才写入默认勾选，否则新事件到达会把用户取消过的项重新勾上。
  const defaultedHosts = useRef(new Set<string>());

  useEffect(() => {
    setError(null);
    const newlySeenHosts = compatibilityEvents
      .map((event) => event.host.trim().toLowerCase())
      .filter((host) => !defaultedHosts.current.has(host));
    if (newlySeenHosts.length === 0) {
      return;
    }
    newlySeenHosts.forEach((host) => defaultedHosts.current.add(host));
    setSelectedPatterns((current) => new Set([...current, ...newlySeenHosts]));
  }, [compatibilityEvents]);

  const togglePattern = (pattern: string): void => {
    setSelectedPatterns((current) => {
      const next = new Set(current);
      if (!next.delete(pattern)) {
        next.add(pattern);
      }
      return next;
    });
  };

  const dismiss = (): void => {
    if (busy || compatibilityEvents.length === 0) {
      return;
    }
    dismissCompatibility(compatibilityEvents);
    defaultedHosts.current.clear();
    setSelectedPatterns(new Set());
  };

  const addSelectedPatterns = (): void => {
    if (selectedPatterns.size === 0 || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    const events = [...compatibilityEvents];
    const patterns = [...selectedPatterns];
    void TlsCompatibilityActions.addPatterns(patterns, events)
      .then((result) => {
        if (!result.ok) {
          setError(result.message);
          return;
        }
        defaultedHosts.current.clear();
        setSelectedPatterns(new Set());
        onOpenSettings();
      })
      .catch((reason: unknown) => setError(describeError(reason)))
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      open={compatibilityEvents.length > 0}
      centered
      width={512}
      closable={false}
      footer={null}
      title={null}
      mask={{ closable: !busy }}
      keyboard={!busy}
      destroyOnHidden
      onCancel={dismiss}
      classNames={{ container: styles.dialog, body: styles.dialogBody }}
      styles={{
        container: { padding: 0, border: '1px solid var(--border-2)' },
        body: { padding: 0, lineHeight: 1.23 },
      }}
      aria-labelledby="tls-compatibility-title"
    >
      <header className={styles.header}>
        <span className={styles.icon}><LockOpen aria-hidden="true" /></span>
        <h2 id="tls-compatibility-title">
          {t('settings.tlsPassthrough.compatibilityTitle')}
        </h2>
        <IconButton
          icon={X}
          label={t('settings.cancel')}
          size="sm"
          disabled={busy}
          onClick={dismiss}
        />
      </header>
      <div className={styles.content}>
        <p>{t('settings.tlsPassthrough.compatibilitySummary')}</p>
        <div className={styles.hostList}>
          {compatibilityEvents.map((event) => (
            <div
              className={styles.hostRow}
              key={`${event.generation}:${event.host}`}
              data-parity={`tls-compatibility-host-${event.host}`}
            >
              <span className={styles.hostIcon}><LockOpen aria-hidden="true" /></span>
              <div className={styles.hostCopy}>
                <code>{event.host}</code>
                <span>{t(tlsCompatibilityReasonKey(event.reason))}</span>
              </div>
              <div className={styles.patternChoices}>
                {tlsPassthroughPatternChoices(event.host).map((pattern) => (
                  <label className={styles.patternChoice} key={pattern}>
                    <Checkbox
                      checked={selectedPatterns.has(pattern)}
                      onChange={busy ? undefined : () => togglePattern(pattern)}
                    />
                    <code>{pattern}</code>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.note}>
          <RefreshCw aria-hidden="true" />
          <span>{t('settings.tlsPassthrough.compatibilityApplyHint')}</span>
        </div>
        {error ? <div className={styles.error} role="alert">{error}</div> : null}
      </div>
      <footer className={styles.footer}>
        <Button disabled={busy} onClick={dismiss}>
          {t('settings.tlsPassthrough.compatibilityDismiss')}
        </Button>
        <Button
          icon={LockOpen}
          variant="primary"
          loading={busy}
          disabled={selectedPatterns.size === 0}
          onClick={addSelectedPatterns}
        >
          {t('settings.tlsPassthrough.addSelectedPatterns', {
            count: selectedPatterns.size,
          })}
        </Button>
      </footer>
    </Modal>
  );
}