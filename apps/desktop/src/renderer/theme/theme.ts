import { theme as antTheme, type ThemeConfig } from 'antd';

export type ThemeMode = 'light' | 'dark';

export function createAppTheme(mode: ThemeMode): ThemeConfig {
  return {
    algorithm:
      mode === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    cssVar: {
      prefix: 'interceptor',
    },
    token: {
      borderRadius: 8,
      colorPrimary: '#0a84ff',
      colorError: '#e25555',
      colorWarning: '#d69a2d',
      colorSplit: 'var(--divider)',
      controlItemBgHover: 'var(--divider)',
      controlItemBgActive: 'var(--divider-hover)',
      controlItemBgActiveHover: 'var(--divider-active)',
      fontFamily:
        '"Segoe UI Variable Text", "Segoe UI", -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
      fontFamilyCode: '"IBM Plex Mono", monospace',
      fontSize: 13,
      controlHeight: 34,
      motionDurationFast: '0.12s',
      motionDurationMid: '0.18s',
    },
    components: {
      Button: {
        borderRadius: 8,
        controlHeight: 34,
        controlHeightLG: 40,
        controlHeightSM: 30,
        onlyIconSize: 18,
        onlyIconSizeLG: 21,
        onlyIconSizeSM: 16,
        textHoverBg: 'var(--surface)',
      },
      Input: {
        activeShadow: '0 0 0 3px rgba(10, 132, 255, 0.14)',
        borderRadius: 8,
      },
      Segmented: {
        borderRadius: 9,
        itemColor: 'var(--text-muted)',
        itemHoverColor: 'var(--text)',
        itemHoverBg: 'color-mix(in srgb, var(--surface) 78%, transparent)',
        itemSelectedBg: 'var(--surface)',
        itemSelectedColor: 'var(--text)',
        trackBg: 'var(--surface-hover)',
        trackPadding: 3,
      },
      Splitter: {
        splitBarSize: 1,
        splitTriggerSize: 12,
        splitBarDraggableSize: 0,
      },
      Tabs: {
        titleFontSizeSM: 12,
        horizontalItemGutter: 4,
        horizontalItemPaddingSM: '8px 10px',
        horizontalMargin: '0',
        itemColor: 'var(--text-muted)',
        itemHoverColor: 'var(--text)',
        itemSelectedColor: 'var(--accent)',
        inkBarColor: 'var(--accent)',
      },
    },
  };
}