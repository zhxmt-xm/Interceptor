import { Modal } from 'antd';

import { ActionButton } from '../../components/ActionButton/ActionButton';
import { IconButton } from '../../components/IconButton/IconButton';
import { FixtureIcon } from '../../fixtures/FixtureIcon';
import { useDesignState } from '../../state/useDesignState';
import { androidPairingPatch, androidSurfacePatch, COMPUTER_FINGERPRINT, PHONE_FINGERPRINT } from './utils';
import styles from './AndroidDeviceDialog.module.css';

export function AndroidDeviceDialog(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  if (!state.androidDesktopPreview) return null;
  const paired = state.androidComputerConfirmed && state.androidPhoneConfirmed;
  const pairing = state.androidConnection === 'pairing' && !paired;
  const running = state.androidConnection === 'connected' && state.androidVpn === 'running';
  const stopping = state.androidVpn === 'stopping';
  const blocked = state.androidVpn === 'blocked';
  const ready = state.androidDeviceStatus === 'ready';
  const installed = state.androidPackage === 'installed';
  const forgetting = state.androidDialog === 'forget';
  const stopHelp = state.androidDialog === 'stop-help';
  const close = (): void => updateState({ androidDialog: 'closed' });
  const openPhone = (): void => updateState(androidSurfacePatch(state, false));
  const stop = (): void => updateState({ androidVpn: 'stopping' });
  const cancelPairing = (): void => updateState({
    androidConnection: 'disconnected', androidComputerConfirmed: false, androidPhoneConfirmed: false,
    androidVpn: 'stopped', androidVpnPromptOpen: false, androidError: '',
  });
  const start = (): void => updateState({
    androidConnection: 'pairing', androidError: '', androidVpn: paired ? 'permission' : 'stopped',
  });

  return (
    <Modal open={state.androidDialog !== 'closed'} centered width={640} getContainer={false} destroyOnHidden
      classNames={{ root: styles.androidDeviceModalRoot }}
      styles={{
        root: { position: 'absolute', inset: 0 },
        wrapper: { position: 'absolute' }, mask: { position: 'absolute' },
        container: { padding: 0, border: '1px solid var(--border-2)', borderRadius: 12, overflow: 'hidden', background: 'var(--panel)' },
        header: { padding: '20px 52px 18px 20px', margin: 0, borderBottom: '1px solid var(--border)', background: 'var(--panel)' },
        title: { color: 'var(--text)' }, body: { padding: 0 },
        footer: { padding: '14px 20px', margin: 0, borderTop: '1px solid var(--border)' },
        close: { top: 14, right: 14, width: 30, height: 30, color: 'var(--text-2)' },
      }}
      mask={{ closable: true }} onCancel={close}
      title={<div className={styles.androidDeviceTitle}><FixtureIcon iconId="i-usb" svgProps={{ size: 20 }} />
        <div><h2>{forgetting ? 'Forget Pixel 8?' : stopHelp ? 'Stop on the phone' : 'Android devices'}</h2>
          <p>{forgetting ? 'Remove this pairing, not the app or its certificate.'
            : stopHelp ? 'The computer cannot confirm a remote stop while USB is unavailable.'
            : 'USB only · The phone owns its internet connections'}</p></div>
      </div>}
      footer={stopHelp ? (
        <div className={styles.androidDeviceFooter}><ActionButton label="Back to devices"
          onClick={() => updateState({ androidDialog: 'devices' })} /></div>
      ) : forgetting ? (
        <div className={styles.androidDeviceFooter}>
          <ActionButton label="Cancel" onClick={() => updateState({ androidDialog: 'devices' })} />
          <ActionButton label="Forget pairing" tone="danger" onClick={() => {
            cancelPairing();
            updateState({ androidDialog: 'devices', androidSelectedApps: state.androidSelectedApps.filter(id => id !== 'android') });
          }} />
        </div>
      ) : (
        <div className={styles.androidDeviceFooter}>
          <div className={styles.androidDeviceFooterStart}>
            <ActionButton label="Open phone app" icon={<FixtureIcon iconId="i-external" svgProps={{ size: 15 }} />}
              disabled={!ready || !installed} onClick={openPhone} />
          </div>
          {pairing && <ActionButton label="Cancel pairing" onClick={cancelPairing} />}
          {!ready && paired ? <ActionButton label="How to stop on phone" tone="primary"
            onClick={() => updateState({ androidDialog: 'stop-help' })} />
            : running ? <ActionButton label="Stop capture" tone="primary" onClick={stop} />
            : blocked ? <ActionButton label="Reconnect" tone="primary"
              onClick={() => updateState({ androidConnection: 'connected', androidVpn: 'running', androidError: '' })} />
            : stopping ? <ActionButton label="Stopping…" disabled onClick={stop} />
            : !ready ? <ActionButton label="Refresh devices" onClick={() => updateState({ androidDeviceStatus: 'ready' })} />
            : !installed ? <ActionButton label="Install Android app" tone="primary"
                icon={<FixtureIcon iconId="i-download" svgProps={{ size: 15 }} />}
                onClick={() => updateState({ androidPackage: 'installed' })} />
            : pairing ? <ActionButton label={state.androidComputerConfirmed ? 'Waiting for phone' : 'Confirm this device'}
                disabled={state.androidComputerConfirmed} tone="primary"
                onClick={() => updateState(androidPairingPatch(state, 'computer'))} />
            : state.androidVpn === 'permission' ? <ActionButton label="Continue on phone" tone="primary" onClick={openPhone} />
            : <ActionButton label={paired ? 'Connect again' : 'Connect device'} tone="primary" onClick={start} />}
        </div>
      )}
    >
      <div className={styles.androidDeviceBody} data-design-android-dialog="">
        {stopHelp ? <section className={styles.androidDeviceSetup}>
          <h3>The phone can stop capture without the computer</h3>
          <ol className={styles.androidDeviceStopSteps}>
            <li>Open Interceptor on Pixel 8.</li>
            <li>Tap “停止接管并恢复联网”.</li>
            <li>Wait until the phone reports that every owned operation has ended.</li>
          </ol>
          <div className={styles.androidDeviceNotice} data-tone="warning"><FixtureIcon iconId="i-alert" svgProps={{ size: 18 }} />
            <p>This computer does not report the phone as stopped without confirmation. Reconnecting creates a new session and does not replay old requests.</p>
          </div>
        </section> : forgetting ? <div className={styles.androidDeviceNotice} data-tone="warning">
          <FixtureIcon iconId="i-alert" svgProps={{ size: 18 }} />
          <p>The next connection will require both fingerprints to be confirmed again. The phone’s installation identity and CA remain unchanged.</p>
        </div> : state.androidDeviceStatus === 'empty' ? (
          <section className={styles.androidDeviceEmpty}>
            <FixtureIcon iconId="i-usb" svgProps={{ size: 40 }} />
            <h3>No Android device found</h3>
            <p>Connect a USB data cable, enable USB debugging, and approve this computer in Android’s system prompt.</p>
            <span>Wi-Fi pairing and network proxies are not used.</span>
          </section>
        ) : (
          <>
            <section className={styles.androidDeviceCard}>
              <span className={styles.androidDeviceAvatar}><FixtureIcon iconId="i-android" svgProps={{ size: 30 }} /></span>
              <div className={styles.androidDeviceIdentity}><strong>Pixel 8</strong><span>Android 15 · USB · device …7F21</span></div>
              <span className={styles.androidDeviceState} data-tone={!ready || blocked || state.androidError ? 'warning' : running ? 'success' : 'default'}>
                <span />{state.androidDeviceStatus === 'unauthorized' ? 'USB authorization needed'
                  : state.androidDeviceStatus === 'offline' ? 'Offline' : stopping ? 'Stopping'
                  : running ? 'Capturing' : blocked ? 'Disconnected' : paired ? 'Paired' : 'Not paired'}
              </span>
              <IconButton label="Refresh devices" icon={<FixtureIcon iconId="i-refresh" svgProps={{ size: 15 }} />}
                onClick={() => updateState({ androidDeviceStatus: 'ready' })} />
            </section>
            {!ready && <div className={styles.androidDeviceNotice} data-tone="warning">
              <FixtureIcon iconId="i-alert" svgProps={{ size: 18 }} />
              <p>{state.androidDeviceStatus === 'unauthorized'
                ? 'Unlock the phone and approve the USB debugging system prompt. USB authorization is separate from Interceptor pairing.'
                : 'The device is offline. Check the cable and Android status before reconnecting. Old requests are not replayed.'}</p>
            </div>}
            {ready && !installed && <section className={styles.androidDeviceSetup}>
              <h3>Install the Android app</h3>
              <p>Interceptor will verify the APK version, signature and checksum before installing. Installing the app does not grant VPN access or trust a CA.</p>
              <div className={styles.androidDeviceValue}><span>Bundled version</span><code>0.1.0</code></div>
            </section>}
            {ready && installed && (
              <>
                <div className={styles.androidDeviceValue}><span>Android app</span><code>0.1.0 · Installed</code></div>
                {pairing ? (
                  <section className={styles.androidDeviceSetup}>
                    <h3>Confirm both identities</h3>
                    <p>Compare the complete fingerprints with the phone. Neither USB access nor a single confirmation starts traffic capture.</p>
                    <div className={styles.androidDeviceFingerprints}>
                      <div><span>This computer</span><code data-design-computer-fingerprint="">{COMPUTER_FINGERPRINT}</code><small>Match “电脑身份指纹” on the phone.</small></div>
                      <div><span>Pixel 8 identity</span><code data-design-phone-fingerprint="">{PHONE_FINGERPRINT}</code><small>Match the phone’s own identity details.</small></div>
                    </div>
                    <div className={styles.androidDeviceConfirmations}>
                      <span data-ready={state.androidComputerConfirmed}><FixtureIcon iconId={state.androidComputerConfirmed ? 'i-check' : 'i-clock'} svgProps={{ size: 14 }} />Computer confirmation</span>
                      <span data-ready={state.androidPhoneConfirmed}><FixtureIcon iconId={state.androidPhoneConfirmed ? 'i-check' : 'i-clock'} svgProps={{ size: 14 }} />Phone confirmation</span>
                    </div>
                  </section>
                ) : (
                  <section className={styles.androidDeviceSetup}>
                    <div className={styles.androidDeviceValue}><span>Encrypted USB channel</span><strong>{state.androidConnection === 'connected' ? 'Connected' : 'Not connected'}</strong></div>
                    <div className={styles.androidDeviceValue}><span>Phone VPN</span><strong>{state.androidConnection !== 'connected'
                      ? 'Not confirmed — check phone' : running ? 'Running' : stopping ? 'Waiting for system cleanup' : 'Not running'}</strong></div>
                    <div className={styles.androidDeviceValue}><span>Phone CA</span><strong>{state.androidCa === 'installed' ? 'Installed — app trust still required' : 'Not installed'}</strong></div>
                    {paired && <div className={styles.androidDeviceSource}><FixtureIcon iconId="i-android" svgProps={{ size: 16 }} />
                      <span>Capture source</span><strong>Pixel 8 · Android</strong></div>}
                  </section>
                )}
                {(state.androidVpn === 'permission' || stopping || blocked || state.androidError) && (
                  <div className={styles.androidDeviceNotice} data-tone={blocked || state.androidError ? 'warning' : 'default'}>
                    <FixtureIcon iconId={stopping ? 'i-clock' : 'i-shield'} svgProps={{ size: 18 }} />
                    <p>{stopping ? 'Waiting for the phone to release every owned operation. Some system DNS calls cannot stop immediately; this is not reported as stopped yet.'
                      : blocked ? 'USB is unavailable. The proposed policy keeps the phone VPN blocking until it is explicitly stopped. This policy still requires confirmation.'
                      : state.androidError === 'identity' ? 'The phone has not accepted the computer’s current identity. Compare the fingerprints before pairing again.'
                      : state.androidError === 'vpn-denied' ? 'Android VPN permission was denied. No traffic is being captured.'
                      : 'Continue in the Android system VPN prompt. The USB channel alone is not proof that capture has started.'}</p>
                  </div>
                )}
                {paired && !running && !blocked && !stopping && <button className={styles.androidDeviceForget}
                  onClick={() => updateState({ androidDialog: 'forget' })}>Forget this pairing</button>}
              </>
            )}
            <p className={styles.androidDevicePrivacy}>Rules, Breakpoints and Capture stay on this computer. Android connects to origins; no raw TCP or DNS is forwarded to the PC.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
