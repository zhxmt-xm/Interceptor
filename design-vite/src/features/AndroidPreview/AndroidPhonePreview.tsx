import { FixtureIcon } from '../../fixtures/FixtureIcon';
import { useDesignState } from '../../state/useDesignState';
import { androidPairingPatch, androidPhoneStatus, COMPUTER_FINGERPRINT, PHONE_FINGERPRINT } from './utils';
import styles from './AndroidPhonePreview.module.css';

export function AndroidPhonePreview(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const paired = state.androidComputerConfirmed && state.androidPhoneConfirmed;
  const pairing = state.androidConnection === 'pairing' && !paired;
  const running = state.androidVpn === 'running' && state.androidConnection === 'connected';
  const stopping = state.androidVpn === 'stopping';
  const blocked = state.androidVpn === 'blocked';
  const permission = state.androidVpn === 'permission' || state.androidError === 'vpn-denied';
  const status = androidPhoneStatus(state);
  const vpnLabel = running ? '已启动' : stopping ? '正在停止' : blocked ? '保持阻断'
    : state.androidError === 'vpn-denied' ? '未授权' : permission ? '待系统授权' : '未启动';
  const channelLabel = state.androidConnection === 'connected' ? '已连接'
    : state.androidConnection === 'pairing' ? '等待确认' : state.androidConnection === 'error' ? '不可用' : '未连接';
  const forget = (): void => updateState({
    androidConnection: 'disconnected', androidComputerConfirmed: false, androidPhoneConfirmed: false,
    androidVpn: 'stopped', androidVpnPromptOpen: false, androidError: '', androidIdentityOpen: false,
    androidSelectedApps: state.androidSelectedApps.filter(id => id !== 'android'),
  });
  const requestVpnPermission = (): void => updateState({
    androidVpn: 'permission', androidConnection: 'pairing', androidVpnPromptOpen: true, androidError: '',
  });

  return (
    <article className={styles.androidPhoneFrame} data-design-android-phone="" data-android-state={state.androidConnection}>
      <div className={styles.androidPhoneSystembar}><span>16:51</span><span>Android 15</span></div>
      <header className={styles.androidPhoneBrand}>
        <span className={styles.androidPhoneLogo}><FixtureIcon iconId="i-zap" svgProps={{ size: 23 }} /></span>
        <div><h2>Interceptor</h2><p>Pixel 8 · Android</p></div>
        <FixtureIcon iconId="i-usb" svgProps={{ size: 18 }} />
      </header>
      <div className={styles.androidPhoneScroll} tabIndex={0}>
        <section className={styles.androidPhoneStatus} data-tone={status.tone}>
          <span className={styles.androidPhoneEyebrow}>USB 流量接管</span>
          <h3>{status.title}</h3>
          <p>{status.description}</p>
          <div className={styles.androidPhoneSignals}>
            <span data-ready={running}><FixtureIcon iconId="i-shield" svgProps={{ size: 14 }} />VPN：{vpnLabel}</span>
            <span data-ready={state.androidConnection === 'connected'}><FixtureIcon iconId="i-lock" svgProps={{ size: 14 }} />通道：{channelLabel}</span>
          </div>
        </section>
        {(state.androidConnection !== 'disconnected' || paired) && (
          <section className={styles.androidPhoneCard}>
            <div className={styles.androidPhoneCardHeading}><span>电脑</span><strong>Mac · Interceptor</strong></div>
            {pairing || state.androidError === 'identity' ? (
              <>
                <span className={styles.androidPhoneCaption}>{state.androidError === 'identity' ? '已保存的电脑身份指纹 · 示例' : '电脑身份指纹 · 与电脑本机显示一致'}</span>
                <code className={styles.androidPhoneFingerprint} data-design-computer-fingerprint="">{COMPUTER_FINGERPRINT}</code>
                {pairing && <div className={styles.androidPhoneConsent}>
                  <span data-ready={state.androidComputerConfirmed}><FixtureIcon iconId={state.androidComputerConfirmed ? 'i-check' : 'i-clock'} svgProps={{ size: 13 }} />电脑确认</span>
                  <span data-ready={state.androidPhoneConfirmed}><FixtureIcon iconId={state.androidPhoneConfirmed ? 'i-check' : 'i-clock'} svgProps={{ size: 13 }} />手机确认</span>
                </div>}
              </>
            ) : <p className={styles.androidPhoneVerified}><FixtureIcon iconId="i-check" svgProps={{ size: 14 }} />双方身份已确认，连接不会自动更换身份。</p>}
            <details className={styles.androidPhoneIdentity} open={state.androidIdentityOpen}
              onToggle={event => {
                if (event.currentTarget.open !== state.androidIdentityOpen) updateState({ androidIdentityOpen: event.currentTarget.open });
              }}>
              <summary data-design-android-identity=""><FixtureIcon iconId="i-chev" svgProps={{ size: 13 }} />{paired ? '查看双方身份指纹' : '查看这台手机的身份指纹'}</summary>
              {paired && <><span className={styles.androidPhoneCaption}>电脑身份指纹 · 示例</span><code className={styles.androidPhoneFingerprint}>{COMPUTER_FINGERPRINT}</code></>}
              <span className={styles.androidPhoneCaption}>手机身份指纹 · 与电脑设备详情一致</span>
              <code className={styles.androidPhoneFingerprint} data-design-phone-fingerprint="">{PHONE_FINGERPRINT}</code>
            </details>
          </section>
        )}
        {paired && state.androidError !== 'identity' && (
          <section className={styles.androidPhoneCard}>
            <div className={styles.androidPhoneCardHeading}>
              <span className={styles.androidPhoneCardTitle}><FixtureIcon iconId="i-lock" svgProps={{ size: 15 }} />HTTPS 解密</span>
              <strong data-ready={state.androidCa === 'installed'}>{state.androidCa === 'installed' ? '手机 CA 已安装' : '手机 CA 待安装'}</strong>
            </div>
            <p>此 CA 只属于当前 Android 安装，不使用电脑的 CA 私钥。安装后仍需目标 App 信任用户 CA。</p>
            <button className={styles.androidPhoneLink} data-design-android-ca-guide=""
              onClick={() => updateState({ androidCaGuide: !state.androidCaGuide })}>
              {state.androidCaGuide ? '收起证书步骤' : '查看证书安装步骤'}<FixtureIcon iconId="i-chev-right" svgProps={{ size: 14 }} />
            </button>
            {state.androidCaGuide && <div className={styles.androidPhoneGuide}>
              <ol><li>导出当前手机生成的公开 CA 证书。</li><li>在 Android 系统证书设置中安装。</li><li>返回检查安装状态；证书锁定不会自动绕过。</li></ol>
              <button className={styles.androidPhoneSecondary} data-design-android-ca-check=""
                onClick={() => updateState({ androidCa: 'installed', androidCaGuide: false })}>检查安装状态</button>
            </div>}
          </section>
        )}
        {state.androidHelpOpen && <section className={styles.androidPhoneCard}>
          <h4>连接前准备</h4>
          <ol className={styles.androidPhoneHelp}>
            <li>使用支持数据传输的 USB 线。</li>
            <li>开启 USB 调试，并在系统弹窗授权电脑。</li>
            <li>在电脑的 Android devices 中连接，再核对双方指纹。</li>
          </ol>
        </section>}
        <p className={styles.androidPhoneFootnote}>配对、VPN 授权和 CA 安装彼此独立。没有全部满足接管前提时，不报告接管已开始。</p>
      </div>
      <footer className={styles.androidPhoneActions}>
        {running ? <button className={styles.androidPhoneSecondary} data-design-android-stop=""
          onClick={() => updateState({ androidVpn: 'stopping' })}>停止接管</button>
          : stopping ? <button className={styles.androidPhonePrimary} disabled><FixtureIcon iconId="i-clock" svgProps={{ size: 17 }} />等待安全收尾…</button>
          : blocked ? <button className={styles.androidPhonePrimary} data-design-android-stop=""
            onClick={() => updateState({ androidVpn: 'stopping' })}>停止接管并恢复联网</button>
          : state.androidError === 'identity' ? <button className={styles.androidPhoneSecondary} onClick={forget}>忘记旧配对，重新核对</button>
          : permission ? <button className={styles.androidPhonePrimary} data-design-android-vpn=""
            disabled={state.androidVpnPromptOpen} onClick={requestVpnPermission}>
            {state.androidVpnPromptOpen ? '等待系统 VPN 授权…' : '打开系统 VPN 授权'}
          </button>
          : pairing ? <button className={styles.androidPhonePrimary} data-design-android-confirm-phone=""
            disabled={state.androidPhoneConfirmed} onClick={() => updateState(androidPairingPatch(state, 'phone'))}>
            {state.androidPhoneConfirmed ? '等待电脑确认设备' : '指纹一致，确认这台电脑'}
          </button>
          : paired ? <button className={styles.androidPhonePrimary}
            onClick={() => updateState({ androidConnection: 'pairing', androidVpn: 'permission', androidError: '' })}>开始接管</button>
          : <button className={styles.androidPhonePrimary} data-design-android-help=""
            onClick={() => updateState({ androidHelpOpen: !state.androidHelpOpen })}>查看连接步骤</button>}
        {pairing && <button className={styles.androidPhoneTextButton} onClick={forget}>取消本次配对</button>}
        {blocked && <p>USB 不可用时，也可以直接在这台手机上停止。</p>}
        {paired && !running && !blocked && !stopping && !permission &&
          <button className={styles.androidPhoneTextButton} onClick={forget}>忘记电脑配对</button>}
      </footer>
      <div className={styles.androidPhoneGesture} aria-hidden="true" />
    </article>
  );
}
