import { ActionButton } from '../../components/ActionButton/ActionButton';
import { useDesignState } from '../../state/useDesignState';
import { AndroidPhonePreview } from './AndroidPhonePreview';
import { ANDROID_PHONE_SCENES, androidSceneId, androidScenePatch, androidSurfacePatch } from './utils';
import styles from './AndroidPreview.module.css';

export function AndroidPreview(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const scene = androidSceneId(state);
  return (
    <section className={styles.androidPreviewRoot}>
      <header className={styles.androidPreviewHeader}>
        <div><h1>Android · USB 接入</h1><p>设计候选，未写入产品。配对、VPN、数据通道与 CA 各自展示，不互相代替。</p></div>
        <nav aria-label="设计场景">
          {ANDROID_PHONE_SCENES.map(([value, label]) => (
            <button key={value} data-design-android-scene={value} data-selected={scene === value}
              onClick={() => updateState(androidScenePatch(value))}>{label}</button>
          ))}
        </nav>
      </header>
      <div className={styles.androidPreviewLayout}>
        <AndroidPhonePreview />
        <aside className={styles.androidPreviewNotes}>
          <span className={styles.androidPreviewEyebrow}>首轮界面范围</span>
          <h2>手机只负责连接与授权</h2>
          <ul>
            <li>电脑确认手机身份，手机确认电脑身份；完整指纹不截短。</li>
            <li>VPN 与 USB 通道分开展示，授权拒绝不会显示接管成功。</li>
            <li>CA 安装独立，不下发电脑私钥，也不承诺所有 App 都能解密。</li>
            <li>停止时保留等待状态，不因系统 DNS 尚未退出就报告已停止。</li>
          </ul>
          <ActionButton label="查看电脑设备入口" onClick={() => updateState(androidSurfacePatch(state, true))} />
          {state.androidVpn === 'stopping' && <div className={styles.androidPreviewDemoAction}>
            <ActionButton label="模拟收尾完成" onClick={() => updateState({ androidVpn: 'stopped', androidConnection: 'disconnected', androidError: '' })} />
          </div>}
          <h2>仍需明确确认</h2>
          <p>USB 中断画面演示“保留 VPN 阻断”的建议；未知 TCP/UDP 与断线后的联网策略尚未定稿。不能把这张候选图当作用户已经批准。</p>
          <p>所有操作只切换设计状态，不发起 USB、VPN 或系统证书授权。系统窗口以实际 Android 为准，Rules、Breakpoints 和 Capture 仍在电脑。</p>
        </aside>
      </div>
    </section>
  );
}
