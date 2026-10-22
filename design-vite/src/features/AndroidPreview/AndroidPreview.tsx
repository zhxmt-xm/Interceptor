import { FixtureIcon } from '../../fixtures/FixtureIcon';
import { useDesignState } from '../../state/useDesignState';
import type { DesignState } from '../../state/types';
import styles from './AndroidPreview.module.css';

const STATES: ReadonlyArray<readonly [DesignState['androidConnection'], string]> = [
  ['disconnected', '未连接'], ['pairing', '首次配对'], ['connected', '正在接管'], ['error', '连接中断'],
];

export function AndroidPreview(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const connected = state.androidConnection === 'connected';
  const pairing = state.androidConnection === 'pairing';
  const failed = state.androidConnection === 'error';
  return (
    <section className={styles.androidPreviewRoot}>
      <header className={styles.androidPreviewHeader}>
        <div><h1>Android · USB 接入</h1><p>设计候选，尚未接入产品。手机持有真实连接，电脑决定如何处理。</p></div>
        <nav aria-label="设计场景">
          {STATES.map(([value, label]) => (
            <button key={value} data-selected={state.androidConnection === value} onClick={() => updateState({ androidConnection: value })}>{label}</button>
          ))}
        </nav>
      </header>
      <div className={styles.androidPreviewLayout}>
        <article className={styles.androidPreviewPhone} data-android-state={state.androidConnection}>
          <div className={styles.androidPreviewSystembar}><span>16:51</span><span>Android 15</span></div>
          <div className={styles.androidPreviewContent}>
            <header className={styles.androidPreviewBrand}><FixtureIcon iconId="i-shield" svgProps={{ size: 24 }} /><div><h2>Interceptor</h2><p>Android</p></div></header>
            <section className={styles.androidPreviewStatus}>
              <span className={styles.androidPreviewEyebrow}>USB 流量接管</span>
              <h3>{connected ? '正在接管' : pairing ? '确认电脑身份' : failed ? '连接已中断' : '连接你的电脑'}</h3>
              <p>{connected ? '手机在本地转发请求，经 USB 等待电脑的处理决定。' : pairing ? '核对电脑端显示的指纹，一致后再信任并开始。' : failed ? 'USB 通道已断开。流量保持阻断，停止接管后恢复普通联网；请求不会自动重放。' : '用 USB 数据线连接，在电脑端选择设备并连接。'}</p>
              <div className={styles.androidPreviewBadge}><FixtureIcon iconId={connected ? 'i-check' : failed ? 'i-alert' : 'i-lock'} svgProps={{ size: 16 }} />{connected ? 'VPN 已启动 · 加密通道已连接' : pairing ? '流量尚未接管' : failed ? 'USB 通道不可用' : '流量尚未接管'}</div>
            </section>
            <section className={styles.androidPreviewCard}>
              <span className={styles.androidPreviewEyebrow}>电脑</span>
              <strong>{connected || pairing ? 'Mac · Interceptor' : '等待电脑连接'}</strong>
              {(connected || pairing) && <><span className={styles.androidPreviewCaption}>电脑身份指纹 · 示例</span><code>8A31 D902 7FC4 16BD<br />53E8 A091 C72F 4B60<br />D915 6A3C E82B 07F4<br />9C20 B165 3D7E A804</code></>}
              {!connected && !pairing && <p>请开启 USB 调试，并在手机系统弹窗中授权这台电脑。</p>}
            </section>
            <button className={styles.androidPreviewPrimary} onClick={() => updateState({ androidConnection: connected ? 'disconnected' : pairing ? 'connected' : 'pairing' })}>
              {connected ? '停止接管' : pairing ? '指纹一致，信任并开始' : failed ? '重新连接' : '连接电脑'}
            </button>
            {pairing && <button className={styles.androidPreviewCancel} onClick={() => updateState({ androidConnection: 'disconnected' })}>取消</button>}
            {failed && <button className={styles.androidPreviewCancel} onClick={() => updateState({ androidConnection: 'disconnected' })}>停止接管并恢复联网</button>}
            <p className={styles.androidPreviewFootnote}>首次开始会请求系统 VPN 授权。HTTPS 解密还需要目标 App 信任此 Android 安装生成的 CA。</p>
          </div>
        </article>
        <aside className={styles.androidPreviewNotes}>
          <span className={styles.androidPreviewEyebrow}>首轮界面范围</span>
          <h2>只保留一个连接页面</h2>
          <ul>
            <li>顶部：Interceptor 标识与 Android 平台说明。</li>
            <li>状态区：未连接、首次配对、接管中、连接中断。</li>
            <li>电脑卡片：连接对象与完整身份指纹。</li>
            <li>底部：连接或停止按钮；首次配对另有取消。</li>
            <li>VPN 授权、通知和证书安装使用 Android 系统界面。</li>
          </ul>
          <h2>不把桌面功能搬到手机</h2>
          <p>Rules、Breakpoints 和 Capture 继续使用 PC 现有界面。手机首轮不增加规则编辑、多设备列表或流量列表。</p>
          <p>这是新页面的拟议效果，没有产品改前截图。正式实现前需确认；当前候选默认关闭，不修改既有设计基准。</p>
        </aside>
      </div>
    </section>
  );
}
