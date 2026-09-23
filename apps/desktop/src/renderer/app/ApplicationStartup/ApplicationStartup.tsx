import { App as AntApp, ConfigProvider } from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getLanguageDefinition, resolveLanguageId } from '../../i18n/languages';
import { createAppTheme } from '../../theme/theme';
import { App } from '../App';
import { BootScreen } from '../BootScreen/BootScreen';
import { PlatformOperationMessage } from '../PlatformOperationMessage/PlatformOperationMessage';
import { useBootStore } from '../bootStore';
import { readInitialTheme } from '../utils';
import styles from './ApplicationStartup.module.css';

export function ApplicationStartup(): React.JSX.Element {
  const mainReady = useBootStore((state) => state.mainReady);
  const [themeMode] = useState(readInitialTheme);
  const { i18n } = useTranslation();
  const language = resolveLanguageId(i18n.resolvedLanguage ?? i18n.language);

  useEffect(() => {
    if (mainReady) return;
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.lang = language;
    document.documentElement.dir = 'ltr';
  }, [mainReady, themeMode, language]);

  useEffect(() => {
    let active = true;
    const apply = useBootStore.getState().applyStartupStage;
    const unsubscribe = window.interceptor.onStartupStageChange(apply);
    void window.interceptor.getStartupStage().then((stage) => {
      if (active) apply(stage);
    }).catch((error: unknown) => {
      if (active) useBootStore.getState().fail(error instanceof Error ? error.message : String(error));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (mainReady) return <App />;
  return (
    <ConfigProvider componentSize="small" direction="ltr" locale={getLanguageDefinition(language).antdLocale} theme={createAppTheme(themeMode)}>
      <AntApp className={styles.startup}>
        <BootScreen />
        <PlatformOperationMessage />
      </AntApp>
    </ConfigProvider>
  );
}