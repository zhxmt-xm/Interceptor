import { useDesignState } from '../../state/useDesignState';
import { createDesignTheme } from '../../theme/theme';
import { ANDROID_PHONE_SCENES, androidSceneId, androidScenePatch, androidSurfacePatch } from './utils';
import styles from './AndroidPreviewControls.module.css';

export function AndroidPreviewControls(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  if (!state.androidPreview && !state.androidDesktopPreview) return null;
  const tokens = createDesignTheme(state.theme).token;
  return (
    <nav className={styles.androidPreviewControls} aria-label="Android design controls" data-design-android-controls=""
      style={{ color: tokens?.colorText, background: tokens?.colorBgElevated, borderColor: tokens?.colorTextSecondary }}>
      <span>Android UI 候选</span>
      <button data-active={state.androidPreview} onClick={() => updateState(androidSurfacePatch(state, false))}>手机</button>
      <button data-active={state.androidDesktopPreview} onClick={() => updateState(androidSurfacePatch(state, true))}>电脑</button>
      <select aria-label="Android preview scene" value={androidSceneId(state)} onChange={event => {
        const scene = ANDROID_PHONE_SCENES.find(([id]) => id === event.currentTarget.value);
        if (!scene) throw new Error('Unknown Android preview scene');
        updateState({ ...androidScenePatch(scene[0]), androidDialog: state.androidDesktopPreview ? 'devices' : 'closed' });
      }}>
        {ANDROID_PHONE_SCENES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      {state.androidDesktopPreview && <select aria-label="USB preview state"
        value={state.androidDeviceStatus === 'ready' && state.androidPackage === 'missing' ? 'install' : state.androidDeviceStatus}
        onChange={event => {
          const value = event.currentTarget.value;
          if (value === 'install') updateState({ ...androidScenePatch('disconnected'), androidPackage: 'missing', androidDialog: 'devices' });
          else if (value === 'offline') updateState({ ...androidScenePatch('error'), androidDialog: 'devices' });
          else if (value === 'ready' || value === 'empty' || value === 'unauthorized') {
            updateState({ ...androidScenePatch('disconnected'), androidDeviceStatus: value, androidDialog: 'devices' });
          } else throw new Error('Unknown Android USB preview state');
        }}>
        <option value="ready">USB 已授权</option><option value="install">未安装 App</option>
        <option value="unauthorized">USB 未授权</option><option value="offline">设备离线</option><option value="empty">无设备</option>
      </select>}
      {state.androidVpnPromptOpen && <>
        <span>系统授权结果演示</span>
        <button data-design-android-vpn-allow="" onClick={() => updateState({
          androidVpn: 'running', androidConnection: 'connected', androidVpnPromptOpen: false, androidError: '',
        })}>模拟允许</button>
        <button data-design-android-vpn-deny="" onClick={() => updateState({
          androidVpn: 'stopped', androidConnection: 'error', androidVpnPromptOpen: false, androidError: 'vpn-denied',
        })}>模拟拒绝</button>
      </>}
      {state.androidVpn === 'stopping' && <button data-design-android-finish-stop=""
        onClick={() => updateState({ androidVpn: 'stopped', androidConnection: 'disconnected', androidError: '' })}>模拟收尾完成</button>}
    </nav>
  );
}
