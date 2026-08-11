import { theme as antTheme, type ThemeConfig } from 'antd';

import type { DesignTheme } from '../state/types';

interface DesignPalette {
  readonly accent: string;
  readonly panel: string;
  readonly success: string;
  readonly text: string;
  readonly textSecondary: string;
}

const PALETTE_BY_THEME: Readonly<Record<DesignTheme, DesignPalette>> = {
  light: {
    accent: '#6a5bf0',
    panel: '#ffffff',
    success: '#12a150',
    text: '#1a1b1e',
    textSecondary: '#5b5e65',
  },
  dark: {
    accent: '#2fd4b8',
    panel: '#0f1116',
    success: '#3ecf8e',
    text: '#f3f4f8',
    textSecondary: '#a4abbb',
  },
  warm: {
    accent: '#c2703a',
    panel: '#fdfbf7',
    success: '#3f8f4f',
    text: '#2c2620',
    textSecondary: '#6d6355',
  },
  ember: {
    accent: '#d99a3c',
    panel: '#1e1a16',
    success: '#93c389',
    text: '#f4eee3',
    textSecondary: '#bdb4a4',
  },
};

export function createDesignTheme(mode: DesignTheme): ThemeConfig {
  const palette = PALETTE_BY_THEME[mode];
  return {
    algorithm: mode === 'dark' || mode === 'ember'
      ? antTheme.darkAlgorithm
      : antTheme.defaultAlgorithm,
    token: {
      colorPrimary: palette.accent,
      colorSuccess: palette.success,
      colorBgElevated: palette.panel,
      colorText: palette.text,
      colorTextSecondary: palette.textSecondary,
      borderRadius: 9,
      controlHeight: 34,
      fontFamily: 'var(--font-ui)',
      fontSize: 13,
      motionDurationFast: '0.12s',
      motionDurationMid: '0.18s',
    },
  };
}