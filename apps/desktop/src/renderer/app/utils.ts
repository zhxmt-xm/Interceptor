import type { ThemeMode } from '../theme/theme';

/** 主题优先取用户上次的选择，没有记录时跟随系统深浅色。 */
export function readInitialTheme(): ThemeMode {
  const stored = window.localStorage.getItem('interceptor.theme');
  if (
    stored === 'light'
    || stored === 'dark'
    || stored === 'warm'
    || stored === 'ember'
  ) {
    return stored;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}
