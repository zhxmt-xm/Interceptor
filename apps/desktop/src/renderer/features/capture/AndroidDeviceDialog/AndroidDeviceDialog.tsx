import { Modal } from 'antd';
import { Download, ExternalLink, RefreshCw, TriangleAlert, Usb } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { AndroidDesktopStatus } from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Button } from '../../../components';
import { AndroidMark } from './AndroidMark';
import { androidDeviceLabel, formatAndroidFingerprint, validAndroidFingerprint } from './utils';
import styles from './AndroidDeviceDialog.module.css';

export interface AndroidDeviceDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function AndroidDeviceDialog({ open, onClose }: AndroidDeviceDialogProps): React.JSX.Element {
  const [status, setStatus] = useState<AndroidDesktopStatus | null>(null);
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);
  const [deviceFingerprint, setDeviceFingerprint] = useState('');
  const [fingerprintEditing, setFingerprintEditing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    setError(null);
    try {
      const next = await window.interceptor.getAndroidStatus();
      setStatus(next);
      setSelectedSerial((current) => {
        if (current && next.devices.some(device => device.serial === current)) return current;
        return next.connectedSerial ?? next.devices.find(device => device.state === 'ready')?.serial
          ?? next.devices[0]?.serial ?? null;
      });
      if (next.deviceFingerprint) setDeviceFingerprint(next.deviceFingerprint);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    void refresh();
    return window.interceptor.onAndroidStatusChange((next) => {
      setStatus(next);
      if (next.deviceFingerprint) setDeviceFingerprint(next.deviceFingerprint);
    });
  }, [open]);

  const selected = useMemo(
    () => status?.devices.find(device => device.serial === selectedSerial) ?? null,
    [selectedSerial, status],
  );
  const connected = status?.connectedSerial !== null && status?.connectedSerial !== undefined;
  const installed = selected?.application.state === 'current';
  const canInstall = selected?.state === 'ready' && (
    selected.application.state === 'missing' ||
    selected.application.state === 'update-available' ||
    selected.application.state === 'reinstall-required'
  ) && !busy;
  const canConnect = selected?.state === 'ready' && installed &&
    validAndroidFingerprint(deviceFingerprint) && !busy;

  const installApplication = async (): Promise<void> => {
    if (!selected || !canInstall) return;
    setBusy(true);
    setError(null);
    try {
      setStatus(await window.interceptor.installAndroidApplication(selected.serial));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const connect = async (): Promise<void> => {
    if (!selected || !canConnect) return;
    setBusy(true);
    setError(null);
    try {
      setStatus(await window.interceptor.connectAndroidDevice(selected.serial, deviceFingerprint));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await window.interceptor.disconnectAndroidDevice());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const openApplication = async (): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await window.interceptor.openAndroidApplication(selected.serial);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      centered
      width={640}
      destroyOnHidden
      onCancel={onClose}
      title={(
        <div className={styles.title} data-parity="android-device-dialog-title">
          <Usb aria-hidden size={20} />
          <div>
            <h2>Android devices</h2>
            <p>USB only · The phone owns its internet connections</p>
          </div>
        </div>
      )}
      footer={(
        <div className={styles.footer} data-parity="android-device-dialog-footer">
          <span className={styles.footerStart}>
            <Button size="sm" icon={ExternalLink} onClick={() => void openApplication()}
              disabled={selected?.state !== 'ready' || !installed || busy}
              automationId={AUTOMATION_IDS.capture.android.openApplication}>Open phone app</Button>
          </span>
          {connected ? (
            <Button size="sm" variant="danger" loading={busy} onClick={() => void disconnect()}
              automationId={AUTOMATION_IDS.capture.android.disconnect}>Disconnect device</Button>
          ) : selected?.state === 'ready' && !installed ? (
            <Button size="sm" variant="primary" icon={Download} loading={busy} disabled={!canInstall}
              onClick={() => void installApplication()}
              automationId={AUTOMATION_IDS.capture.android.installApplication}>
              {selected.application.state === 'update-available' ? 'Update Android app'
                : selected.application.state === 'reinstall-required' ? 'Reinstall Android app'
                : 'Install Android app'}
            </Button>
          ) : (
            <Button size="sm" variant="primary" loading={busy} disabled={!canConnect}
              disabledTooltip="Select an authorized device and enter its full fingerprint."
              onClick={() => void connect()} automationId={AUTOMATION_IDS.capture.android.connect}>
              Confirm this device
            </Button>
          )}
        </div>
      )}
      classNames={{
        container: styles.dialog,
        body: styles.body,
        header: styles.header,
        footer: styles.modalFooter,
      }}
      styles={{
        container: {
          padding: 0,
          border: '1px solid var(--border-2)',
          borderRadius: 12,
          overflow: 'hidden',
          background: 'var(--panel)',
        },
        header: {
          padding: '20px 52px 18px 20px',
          margin: 0,
          borderBottom: '1px solid var(--border)',
          background: 'var(--panel)',
        },
        body: { padding: 0 },
        footer: { padding: '14px 20px', margin: 0, borderTop: '1px solid var(--border)' },
      }}
    >
      <section className={styles.content} data-automation-id={AUTOMATION_IDS.capture.android.dialog}>
        {error ? (
          <div className={styles.notice} data-tone="warning">
            <TriangleAlert aria-hidden size={18} />
            <p>{error}</p>
          </div>
        ) : null}
        {!status ? (
          <div className={styles.loading}>Loading Android devices…</div>
        ) : status.devices.length === 0 ? (
          <div className={styles.empty}>
            <Usb aria-hidden size={38} />
            <h3>No Android device found</h3>
            <p>Connect a USB data cable, enable USB debugging, and approve this computer in Android.</p>
          </div>
        ) : (
          <>
            <div className={styles.deviceList}>
              {status.devices.map((device) => (
                <button key={device.serial} type="button"
                  className={styles.device}
                  data-parity="android-device-card"
                  data-selected={device.serial === selectedSerial}
                  onClick={() => setSelectedSerial(device.serial)}
                  data-automation-id={AUTOMATION_IDS.capture.android.device}>
                  <AndroidMark />
                  <span className={styles.deviceIdentity}>
                    <strong>{androidDeviceLabel(device)}</strong>
                    <span>{device.serial}</span>
                  </span>
                  <span className={styles.deviceState} data-state={device.state}>
                    <span />{device.state === 'ready' ? 'USB authorized'
                      : device.state === 'unauthorized' ? 'USB authorization needed' : 'Offline'}
                  </span>
                  <RefreshCw aria-hidden size={15} />
                </button>
              ))}
            </div>
            {selected?.state === 'ready' && !installed ? (
              <>
                <div className={styles.identitySection} data-parity="android-device-install">
                  <h3>{selected.application.state === 'update-available'
                    ? 'Update the Android app'
                    : selected.application.state === 'reinstall-required'
                      ? 'Reinstall the Android app'
                      : 'Install the Android app'}</h3>
                  <p>Interceptor will verify the APK version, signature and checksum before installing. Installing the app does not grant VPN access or trust a CA.</p>
                  <div className={styles.appRow}>
                    <span>Bundled version</span>
                    <code>{selected.application.bundledVersion ?? 'Unavailable'}</code>
                  </div>
                </div>
                {selected.application.detail ? (
                  <div className={styles.notice} data-tone="warning">
                    <TriangleAlert aria-hidden size={18} />
                    <p>{selected.application.detail}</p>
                  </div>
                ) : null}
              </>
            ) : selected?.state === 'ready' ? (
              <>
                <div className={styles.appRow}>
                  <span>Android app</span>
                  <code>{selected.application.installedVersion} · Installed</code>
                </div>
                <div className={styles.identitySection}>
                  <h3>{connected ? 'Paired identities' : 'Confirm both identities'}</h3>
                  <p>Compare the complete fingerprints with the phone. Neither USB access nor a single confirmation starts traffic capture.</p>
                  <div className={styles.fingerprints} data-parity="android-device-fingerprints">
                    <div>
                      <span>This computer</span>
                      <code data-automation-id={AUTOMATION_IDS.capture.android.computerFingerprint}>
                        {formatAndroidFingerprint(status.computerFingerprint)}
                      </code>
                      <small>Match “电脑身份指纹” on the phone.</small>
                    </div>
                    <div>
                      <label htmlFor="android-device-fingerprint">Android device identity</label>
                      {connected && status.deviceFingerprint ? (
                        <code>{formatAndroidFingerprint(status.deviceFingerprint)}</code>
                      ) : !fingerprintEditing && validAndroidFingerprint(deviceFingerprint) ? (
                        <button type="button" className={styles.fingerprintValue}
                          onClick={() => setFingerprintEditing(true)}>
                          <code>{formatAndroidFingerprint(deviceFingerprint)}</code>
                        </button>
                      ) : (
                        <textarea id="android-device-fingerprint" value={deviceFingerprint}
                          onChange={(event) => setDeviceFingerprint(event.target.value)}
                          onBlur={() => {
                            if (validAndroidFingerprint(deviceFingerprint)) setFingerprintEditing(false);
                          }}
                          placeholder="16 groups × 4 hexadecimal digits"
                          data-automation-id={AUTOMATION_IDS.capture.android.deviceFingerprint} />
                      )}
                      <small>Enter the complete fingerprint shown by the phone.</small>
                    </div>
                  </div>
                </div>
                {connected ? (
                  <div className={styles.connection}>
                    <span>Encrypted USB channel</span>
                    <strong>{status.phoneConnected ? 'Connected' : 'Waiting for phone'}</strong>
                  </div>
                ) : (
                  <div className={styles.confirmations}>
                    <span>○ Computer confirmation</span>
                    <span>○ Phone confirmation</span>
                  </div>
                )}
              </>
            ) : null}
            <p className={styles.privacy} data-install={selected?.state === 'ready' && !installed}>
              Rules, Breakpoints and Capture stay on this computer. Android connects to origins; raw TCP and DNS are
              not forwarded to the PC.
            </p>
          </>
        )}
      </section>
    </Modal>
  );
}
