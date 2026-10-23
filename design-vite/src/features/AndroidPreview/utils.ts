import type { FixtureElementNode, FixtureNode } from '../../fixtures/FixtureNode';
import type { DesignState, DesignStatePatch } from '../../state/types';

export const COMPUTER_FINGERPRINT = '8A31 D902 7FC4 16BD\n53E8 A091 C72F 4B60\nD915 6A3C E82B 07F4\n9C20 B165 3D7E A804';
export const PHONE_FINGERPRINT = '2C71 A84D 6E20 9B15\nF308 42CA D967 10EB\n84F2 B605 39AC E718\nD092 6F43 A1BE 57C0';

export type AndroidPreviewScene = 'disconnected' | 'pairing' | 'permission' | 'connected' | 'https' | 'stopping' | 'error' | 'identity' | 'vpn-denied';

export const ANDROID_PHONE_SCENES: ReadonlyArray<readonly [AndroidPreviewScene, string]> = [
  ['disconnected', '未连接'], ['pairing', '双端配对'], ['permission', 'VPN 授权'],
  ['connected', '正在接管'], ['https', 'CA 已安装'], ['stopping', '停止中'],
  ['error', 'USB 中断'], ['identity', '身份不符'], ['vpn-denied', '授权拒绝'],
];

const ANDROID_SCENE_BASE: DesignStatePatch = {
  androidConnection: 'disconnected', androidDeviceStatus: 'ready', androidPackage: 'installed',
  androidComputerConfirmed: false, androidPhoneConfirmed: false, androidVpn: 'stopped', androidVpnPromptOpen: false, androidCa: 'missing',
  androidError: '', androidIdentityOpen: false, androidCaGuide: false, androidHelpOpen: false, androidSelectedApps: [],
};

export function androidScenePatch(scene: AndroidPreviewScene): DesignStatePatch {
  const paired = { androidComputerConfirmed: true, androidPhoneConfirmed: true } as const;
  const scenes: Readonly<Record<AndroidPreviewScene, DesignStatePatch>> = {
    disconnected: {},
    pairing: { androidConnection: 'pairing' },
    permission: { ...paired, androidConnection: 'pairing', androidVpn: 'permission' },
    connected: { ...paired, androidConnection: 'connected', androidVpn: 'running' },
    https: { ...paired, androidConnection: 'connected', androidVpn: 'running', androidCa: 'installed' },
    stopping: { ...paired, androidConnection: 'connected', androidVpn: 'stopping', androidCa: 'installed' },
    error: { ...paired, androidConnection: 'error', androidDeviceStatus: 'offline', androidVpn: 'blocked', androidError: 'usb' },
    identity: { androidConnection: 'error', androidError: 'identity' },
    'vpn-denied': { ...paired, androidConnection: 'error', androidError: 'vpn-denied' },
  };
  return { ...ANDROID_SCENE_BASE, ...scenes[scene] };
}

export function androidSceneId(state: DesignState): AndroidPreviewScene {
  if (state.androidVpn === 'stopping') return 'stopping';
  if (state.androidError === 'identity') return 'identity';
  if (state.androidError === 'vpn-denied') return 'vpn-denied';
  if (state.androidVpn === 'blocked') return 'error';
  if (state.androidVpn === 'permission') return 'permission';
  if (state.androidConnection === 'pairing') return 'pairing';
  if (state.androidConnection === 'connected' && state.androidVpn === 'running') {
    return state.androidCa === 'installed' ? 'https' : 'connected';
  }
  return 'disconnected';
}

export function androidSurfacePatch(state: DesignState, desktop: boolean): DesignStatePatch {
  return {
    view: desktop ? 'capture' : 'playground', androidPreview: !desktop, androidDesktopPreview: desktop,
    androidDialog: desktop ? 'devices' : 'closed', sidebar: 'collapsed', detail: 'closed',
    androidConnection: state.androidConnection, androidDeviceStatus: state.androidDeviceStatus,
    androidPackage: state.androidPackage, androidComputerConfirmed: state.androidComputerConfirmed,
    androidPhoneConfirmed: state.androidPhoneConfirmed, androidVpn: state.androidVpn, androidCa: state.androidCa,
    androidVpnPromptOpen: state.androidVpnPromptOpen,
    androidError: state.androidError, androidIdentityOpen: false, androidCaGuide: false, androidHelpOpen: false,
    androidSelectedApps: state.androidSelectedApps,
  };
}

export function androidPairingPatch(state: DesignState, side: 'computer' | 'phone'): DesignStatePatch {
  const computer = side === 'computer' || state.androidComputerConfirmed;
  const phone = side === 'phone' || state.androidPhoneConfirmed;
  return {
    androidComputerConfirmed: computer, androidPhoneConfirmed: phone,
    androidConnection: 'pairing', androidVpn: computer && phone ? 'permission' : 'stopped',
  };
}

export function androidSourceAvailable(state: DesignState): boolean {
  return state.androidComputerConfirmed && state.androidPhoneConfirmed;
}

export function androidOnlySourceSelected(state: DesignState): boolean {
  return androidSourceAvailable(state) && state.androidSelectedApps.length === 1 && state.androidSelectedApps[0] === 'android';
}

export function fixtureHasClass(node: FixtureElementNode, name: string): boolean {
  return node.attributes.class?.split(/\s+/).includes(name) ?? false;
}

function fixtureText(node: FixtureNode): string {
  return node.type === 'text' ? node.value : node.children.map(fixtureText).join('');
}

const ANDROID_SOURCE_ROW: FixtureElementNode = {
  type: 'element', tag: 'div',
  attributes: { class: 'fitem', 'data-android-app': 'android', 'data-design-android-source': '' },
  children: [
    { type: 'element', tag: 'span', attributes: { class: 'ai' }, children: [
      { type: 'element', tag: 'svg', attributes: { width: '100%', height: '100%', 'aria-hidden': 'true' },
        children: [{ type: 'element', tag: 'use', attributes: { href: '#i-android' }, children: [] }] },
    ] },
    { type: 'element', tag: 'span', attributes: { class: 'fitem-n', title: 'Pixel 8 · Android' },
      children: [{ type: 'text', value: 'Pixel 8 · Android' }] },
    { type: 'element', tag: 'span', attributes: { class: 'fitem-c' }, children: [{ type: 'text', value: '0' }] },
  ],
};

export function androidCaptureFixture(node: FixtureNode, sourceAvailable: boolean,
  inApplication = false, inToolbar = false): FixtureNode {
  if (node.type === 'text') return node;
  const application = inApplication || node.attributes['data-grp'] === 'application';
  const toolbar = inToolbar || fixtureHasClass(node, 'listbar-end');
  let attributes = node.attributes;
  let children = node.children.map(child => androidCaptureFixture(child, sourceAvailable, application, toolbar));
  if (toolbar && fixtureHasClass(node, 'icon-actions')) {
    attributes = { ...attributes, 'data-design-android-toolbar': '' };
  }
  if (toolbar && fixtureHasClass(node, 'cnt')) {
    attributes = { ...attributes, 'data-design-android-list-count': '' };
  }
  if (application && fixtureHasClass(node, 'fitem')) {
    const label = node.children.find(child => child.type === 'element' && fixtureHasClass(child, 'fitem-n'));
    const labels: Readonly<Record<string, string>> = {
      All: 'all', 'Microsoft Edge': 'edge', 'Node.js': 'node', 'Visual Studio Code': 'code',
      Unknown: 'unknown', Pending: 'pending',
    };
    const id = label ? labels[fixtureText(label)] : undefined;
    if (!id) throw new Error('Android preview could not identify the existing Application filter');
    attributes = { ...attributes, 'data-android-app': id };
  }
  if (application && sourceAvailable && fixtureHasClass(node, 'fgrp-c')) {
    children = [{ type: 'text', value: '6' }];
  }
  if (application && sourceAvailable && fixtureHasClass(node, 'fgrp-b')) {
    children = [...children, ANDROID_SOURCE_ROW];
  }
  return { ...node, attributes, children };
}

export function androidPhoneStatus(state: DesignState): { title: string; description: string; tone: 'default' | 'success' | 'warning' | 'danger' } {
  if (state.androidVpn === 'stopping') return {
    title: '正在停止接管', description: '正在释放连接并等待系统 DNS 结束。完成全部收尾后，才会显示已停止。', tone: 'warning',
  };
  if (state.androidError === 'identity') return {
    title: '电脑身份不匹配', description: '收到的指纹与已保存身份不同。未建立通道，也没有开始接管；请核对电脑后重新配对。', tone: 'danger',
  };
  if (state.androidError === 'vpn-denied') return {
    title: 'VPN 未获授权', description: '你未允许建立 VPN，本次连接已停止。手机仍使用原有网络，配对与 CA 不会因此删除。', tone: 'warning',
  };
  if (state.androidVpn === 'blocked') return {
    title: '连接已中断', description: 'USB 数据通道不可用。当前接管范围保持阻断；停止接管后恢复普通联网，旧请求不会重放。', tone: 'danger',
  };
  if (state.androidVpn === 'running' && state.androidConnection === 'connected') return {
    title: '正在接管', description: '手机连接真实源站，经 USB 等待电脑的 Rules 与 Breakpoints 决定。', tone: 'success',
  };
  if (state.androidVpn === 'permission') return {
    title: '允许系统 VPN', description: '双方身份已确认。接下来由 Android 系统询问 VPN 权限；允许并建立接口后才开始接管。', tone: 'default',
  };
  if (state.androidConnection === 'pairing') return {
    title: '核对双方身份', description: '手机与电脑分别确认对端。两侧都确认前，不发送被捕获流量，也不显示接管成功。', tone: 'default',
  };
  return {
    title: '连接你的电脑', description: '用 USB 数据线连接，在电脑 Capture 的设备入口选择这台手机。手机不通过 Wi-Fi 或局域网接入。', tone: 'default',
  };
}
