import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';

import {
  buildMacosMenuTemplate,
  resolveMacosMenuLanguage,
} from '../../macos-menu';

type MenuItem = MenuItemConstructorOptions;

function submenuOf(item: MenuItem): MenuItem[] {
  return Array.isArray(item.submenu) ? item.submenu : [];
}

function itemLabels(item: MenuItem): string[] {
  const labels = item.label === undefined ? [] : [item.label];
  for (const child of submenuOf(item)) labels.push(...itemLabels(child));
  return labels;
}

function itemRoles(item: MenuItem): string[] {
  const roles: string[] = item.role === undefined ? [] : [item.role];
  for (const child of submenuOf(item)) roles.push(...itemRoles(child));
  return roles;
}

function labelsOf(template: MenuItem[], role: string): string {
  const queue = [...template];
  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.role === role) return item.label ?? '';
    queue.push(...submenuOf(item));
  }
  throw new Error(`Menu role ${role} is missing.`);
}

describe('macOS application menu', () => {
  it('follows the system language, falling back to English', () => {
    expect(resolveMacosMenuLanguage('zh-CN')).toBe('zh');
    expect(resolveMacosMenuLanguage('zh-Hans-CN')).toBe('zh');
    expect(resolveMacosMenuLanguage('zh-TW')).toBe('zh');
    expect(resolveMacosMenuLanguage('en-US')).toBe('en');
    expect(resolveMacosMenuLanguage('ja-JP')).toBe('en');
    expect(resolveMacosMenuLanguage('')).toBe('en');
  });

  it('keeps only app, edit and window menus without reload entries', () => {
    for (const locale of ['zh-CN', 'en-US']) {
      const template = buildMacosMenuTemplate({ locale, applicationName: 'Interceptor' });
      expect(template.map(({ label }) => label)).toEqual(
        locale.startsWith('zh')
          ? ['Interceptor', '编辑', '窗口']
          : ['Interceptor', 'Edit', 'Window'],
      );

      const labels = template.flatMap(itemLabels);
      expect(labels).not.toContain('View');
      expect(labels).not.toContain('显示');
      expect(labels).not.toContain('Reload');
      expect(labels).not.toContain('重新加载');

      const roles = template.flatMap(itemRoles);
      expect(roles).not.toContain('reload');
      expect(roles).not.toContain('forceReload');
      expect(roles).not.toContain('toggleDevTools');
    }
  });

  it('localizes the standard app, edit and window roles', () => {
    const zh = buildMacosMenuTemplate({ locale: 'zh-CN', applicationName: 'Interceptor' });
    expect(labelsOf(zh, 'about')).toBe('关于 Interceptor');
    expect(labelsOf(zh, 'hide')).toBe('隐藏 Interceptor');
    expect(labelsOf(zh, 'quit')).toBe('退出 Interceptor');
    expect(labelsOf(zh, 'undo')).toBe('撤销');
    expect(labelsOf(zh, 'copy')).toBe('拷贝');
    expect(labelsOf(zh, 'paste')).toBe('粘贴');
    expect(labelsOf(zh, 'selectAll')).toBe('全选');
    expect(labelsOf(zh, 'minimize')).toBe('最小化');
    expect(labelsOf(zh, 'zoom')).toBe('缩放');
    expect(labelsOf(zh, 'front')).toBe('前置全部窗口');

    const en = buildMacosMenuTemplate({ locale: 'en-US', applicationName: 'Interceptor' });
    expect(labelsOf(en, 'about')).toBe('About Interceptor');
    expect(labelsOf(en, 'hide')).toBe('Hide Interceptor');
    expect(labelsOf(en, 'quit')).toBe('Quit Interceptor');
    expect(labelsOf(en, 'undo')).toBe('Undo');
    expect(labelsOf(en, 'copy')).toBe('Copy');
    expect(labelsOf(en, 'paste')).toBe('Paste');
    expect(labelsOf(en, 'selectAll')).toBe('Select All');
    expect(labelsOf(en, 'minimize')).toBe('Minimize');
    expect(labelsOf(en, 'zoom')).toBe('Zoom');
    expect(labelsOf(en, 'front')).toBe('Bring All to Front');
  });

  it('keeps accelerator-providing roles instead of hard-coding shortcuts', () => {
    const template = buildMacosMenuTemplate({ locale: 'en-US', applicationName: 'Interceptor' });
    const roles = template.flatMap(itemRoles);
    for (const role of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll', 'quit', 'minimize']) {
      expect(roles).toContain(role);
    }
    expect(template.flatMap(submenuOf)).not.toContainEqual(
      expect.objectContaining({ accelerator: expect.any(String) }),
    );
  });
});
