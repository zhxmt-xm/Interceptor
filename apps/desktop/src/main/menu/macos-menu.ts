import type { MenuItemConstructorOptions } from 'electron';

export type MacosMenuLanguage = 'zh' | 'en';

interface MacosMenuLabels {
  readonly editMenu: string;
  readonly windowMenu: string;
  readonly about: string;
  readonly services: string;
  readonly hide: string;
  readonly hideOthers: string;
  readonly showAll: string;
  readonly quit: string;
  readonly undo: string;
  readonly redo: string;
  readonly cut: string;
  readonly copy: string;
  readonly paste: string;
  readonly pasteAndMatchStyle: string;
  readonly delete: string;
  readonly selectAll: string;
  readonly minimize: string;
  readonly zoom: string;
  readonly bringAllToFront: string;
}

const ENGLISH_LABELS: MacosMenuLabels = {
  editMenu: 'Edit',
  windowMenu: 'Window',
  about: 'About {app}',
  services: 'Services',
  hide: 'Hide {app}',
  hideOthers: 'Hide Others',
  showAll: 'Show All',
  quit: 'Quit {app}',
  undo: 'Undo',
  redo: 'Redo',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  pasteAndMatchStyle: 'Paste and Match Style',
  delete: 'Delete',
  selectAll: 'Select All',
  minimize: 'Minimize',
  zoom: 'Zoom',
  bringAllToFront: 'Bring All to Front',
};

const CHINESE_LABELS: MacosMenuLabels = {
  editMenu: '编辑',
  windowMenu: '窗口',
  about: '关于 {app}',
  services: '服务',
  hide: '隐藏 {app}',
  hideOthers: '隐藏其他',
  showAll: '全部显示',
  quit: '退出 {app}',
  undo: '撤销',
  redo: '重做',
  cut: '剪切',
  copy: '拷贝',
  paste: '粘贴',
  pasteAndMatchStyle: '粘贴并匹配样式',
  delete: '删除',
  selectAll: '全选',
  minimize: '最小化',
  zoom: '缩放',
  bringAllToFront: '前置全部窗口',
};

/** 菜单跟随系统语言；暂未覆盖的语言回退英文，role 的默认 label 不会本地化。 */
export function resolveMacosMenuLanguage(locale: string): MacosMenuLanguage {
  return locale.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function fillApplicationName(text: string, applicationName: string): string {
  return text.replaceAll('{app}', applicationName);
}

/** 逐项构建 app/edit/window 菜单，用 role 保留行为与快捷键，只用 label 提供本地化文案。 */
export function buildMacosMenuTemplate(options: {
  readonly locale: string;
  readonly applicationName: string;
}): MenuItemConstructorOptions[] {
  const labels = resolveMacosMenuLanguage(options.locale) === 'zh'
    ? CHINESE_LABELS
    : ENGLISH_LABELS;
  const label = (text: string): string => fillApplicationName(text, options.applicationName);

  return [
    {
      label: options.applicationName,
      submenu: [
        { role: 'about', label: label(labels.about) },
        { type: 'separator' },
        { role: 'services', label: labels.services },
        { type: 'separator' },
        { role: 'hide', label: label(labels.hide) },
        { role: 'hideOthers', label: labels.hideOthers },
        { role: 'unhide', label: labels.showAll },
        { type: 'separator' },
        { role: 'quit', label: label(labels.quit) },
      ],
    },
    {
      label: labels.editMenu,
      submenu: [
        { role: 'undo', label: labels.undo },
        { role: 'redo', label: labels.redo },
        { type: 'separator' },
        { role: 'cut', label: labels.cut },
        { role: 'copy', label: labels.copy },
        { role: 'paste', label: labels.paste },
        { role: 'pasteAndMatchStyle', label: labels.pasteAndMatchStyle },
        { role: 'delete', label: labels.delete },
        { role: 'selectAll', label: labels.selectAll },
      ],
    },
    {
      label: labels.windowMenu,
      submenu: [
        { role: 'minimize', label: labels.minimize },
        { role: 'zoom', label: labels.zoom },
        { type: 'separator' },
        { role: 'front', label: labels.bringAllToFront },
      ],
    },
  ];
}
