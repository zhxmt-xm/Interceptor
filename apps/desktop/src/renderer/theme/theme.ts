import { theme as antTheme, type ThemeConfig } from 'antd';

export type ThemeMode = 'light' | 'dark' | 'warm' | 'ember';

interface Palette {
  primary: string;
  error: string;
  warning: string;
  success: string;
  info: string;
}

/** Seed colors per theme, mirroring design/app/app.css. Ant derives hover/active
 *  states from these; self-implemented CSS Modules read the same values via
 *  the :root[data-theme] variables in global.css. */
const PALETTE: Record<ThemeMode, Palette> = {
  light: { primary: '#6a5bf0', error: '#e0483a', warning: '#b6820a', success: '#12a150', info: '#2570e0' },
  dark: { primary: '#2fd4b8', error: '#f26d6d', warning: '#f5c451', success: '#3ecf8e', info: '#5b9dff' },
  warm: { primary: '#c2703a', error: '#cf4b3a', warning: '#b07a1a', success: '#3f8f4f', info: '#3f7fb0' },
  ember: { primary: '#d99a3c', error: '#e28470', warning: '#dcb968', success: '#93c389', info: '#84b0cf' },
};

export function createAppTheme(mode: ThemeMode): ThemeConfig {
  const palette = PALETTE[mode];
  return {
    algorithm:
      mode === 'dark' || mode === 'ember' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    cssVar: { prefix: 'interceptor' },
    token: {
      colorPrimary: palette.primary,
      colorError: palette.error,
      colorWarning: palette.warning,
      colorSuccess: palette.success,
      colorInfo: palette.info,
      colorSplit: 'var(--border)',
      colorBorder: 'var(--border-2)',
      colorBgContainer: 'var(--panel)',
      colorText: 'var(--text)',
      colorTextSecondary: 'var(--text-2)',
      colorTextTertiary: 'var(--text-3)',
      borderRadius: 9,
      fontFamily: 'var(--font-ui)',
      fontFamilyCode: 'var(--font-mono)',
      fontSize: 13,
      controlHeight: 34,
      motionDurationFast: '0.12s',
      motionDurationMid: '0.18s',
    },
    components: {
      Splitter: {
        splitBarSize: 1,
        splitTriggerSize: 12,
        splitBarDraggableSize: 0,
      },
      Tabs: {
        titleFontSize: 12.5,
        horizontalItemGutter: 4,
        horizontalItemPadding: '12px 12px',
        horizontalMargin: '0',
        itemColor: 'var(--text-3)',
        itemHoverColor: 'var(--text)',
        itemSelectedColor: 'var(--accent)',
        inkBarColor: 'var(--accent)',
      },
      Tooltip: {
        colorBgSpotlight: 'var(--panel)',
        colorTextLightSolid: 'var(--text)',
        borderRadius: 8,
      },
      Segmented: {
        trackBg: 'var(--panel-2)',
        itemColor: 'var(--text-3)',
        itemHoverColor: 'var(--text)',
        itemSelectedBg: 'var(--bg)',
        itemSelectedColor: 'var(--text)',
        trackPadding: 3,
        borderRadius: 9,
      },
    },
  };
}