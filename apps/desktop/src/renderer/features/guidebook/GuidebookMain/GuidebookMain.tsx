import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ExternalLink,
  RefreshCw,
  Search,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { GUIDEBOOK_ORIGIN } from '../../../../shared/guidebook';
import type { DesktopUiTheme } from '../../../../shared/ui-preferences';
import type { LanguageId } from '../../../i18n/languages';
import {
  createGuidebookOpenSearchMessage,
  createGuidebookSyncMessage,
  guidebookUrl,
  readGuidebookLocationMessage,
} from '../utils';
import styles from './GuidebookMain.module.css';

type GuidebookLoadState = 'loading' | 'ready' | 'error';

interface GuidebookHistory {
  entries: string[];
  index: number;
}

interface GuidebookMainProps {
  language: LanguageId;
  theme: DesktopUiTheme;
}

const LOAD_TIMEOUT_MS = 20_000;

export function GuidebookMain({
  language,
  theme,
}: GuidebookMainProps): React.JSX.Element {
  const { t } = useTranslation();
  const initialUrl = guidebookUrl(language);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const languageRef = useRef(language);
  const timeoutRef = useRef<number | null>(null);
  const [frameSource, setFrameSource] = useState(initialUrl);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [generation, setGeneration] = useState(0);
  const [loadState, setLoadState] = useState<GuidebookLoadState>('loading');
  const [history, setHistory] = useState<GuidebookHistory>({
    entries: [initialUrl],
    index: 0,
  });
  const [openBrowserError, setOpenBrowserError] = useState(false);

  const clearLoadTimeout = useCallback((): void => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startLoading = useCallback((): void => {
    clearLoadTimeout();
    setLoadState(navigator.onLine ? 'loading' : 'error');
    if (navigator.onLine) {
      timeoutRef.current = window.setTimeout(() => {
        setLoadState('error');
        timeoutRef.current = null;
      }, LOAD_TIMEOUT_MS);
    }
  }, [clearLoadTimeout]);

  const postToGuidebook = useCallback((message: unknown): void => {
    iframeRef.current?.contentWindow?.postMessage(message, GUIDEBOOK_ORIGIN);
  }, []);

  const synchronizePreferences = useCallback((): void => {
    postToGuidebook(createGuidebookSyncMessage(theme, language));
  }, [language, postToGuidebook, theme]);

  useEffect(() => {
    if (languageRef.current === language) return;
    languageRef.current = language;
    const nextUrl = guidebookUrl(language);
    setFrameSource(nextUrl);
    setCurrentUrl(nextUrl);
    setHistory({ entries: [nextUrl], index: 0 });
    setGeneration((current) => current + 1);
  }, [language]);

  useEffect(() => {
    startLoading();
    return clearLoadTimeout;
  }, [clearLoadTimeout, frameSource, generation, startLoading]);

  useEffect(() => {
    if (loadState === 'ready') synchronizePreferences();
  }, [loadState, synchronizePreferences]);

  useEffect(() => {
    const handleOffline = (): void => {
      clearLoadTimeout();
      setLoadState('error');
    };
    const handleMessage = (event: MessageEvent<unknown>): void => {
      if (
        event.origin !== GUIDEBOOK_ORIGIN
        || event.source !== iframeRef.current?.contentWindow
      ) {
        return;
      }
      const nextUrl = readGuidebookLocationMessage(event.data);
      if (!nextUrl) return;
      setCurrentUrl(nextUrl);
      setHistory((current) => {
        if (current.entries[current.index] === nextUrl) return current;
        return {
          entries: [...current.entries.slice(0, current.index + 1), nextUrl],
          index: current.index + 1,
        };
      });
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('message', handleMessage);
    };
  }, [clearLoadTimeout]);

  const reload = (): void => {
    setFrameSource(currentUrl);
    setGeneration((current) => current + 1);
  };

  const navigateHistory = (offset: -1 | 1): void => {
    const nextIndex = history.index + offset;
    const nextUrl = history.entries[nextIndex];
    if (!nextUrl) return;
    setHistory((current) => ({ ...current, index: nextIndex }));
    setCurrentUrl(nextUrl);
    setFrameSource(nextUrl);
    setGeneration((current) => current + 1);
  };

  const openInBrowser = (): void => {
    setOpenBrowserError(false);
    void window.interceptor.openGuidebookInBrowser(language).catch((error: unknown) => {
      console.error('[guidebook] Failed to open the browser.', error);
      setOpenBrowserError(true);
    });
  };

  const displayUrl = new URL(currentUrl);

  return (
    <section
      className={styles.root}
      data-state={loadState}
      data-automation-id={AUTOMATION_IDS.guidebook.root}
    >
      <header className={styles.toolbar}>
        <div className={styles.navigation}>
          <button
            type="button"
            aria-label={t('guidebook.back')}
            disabled={history.index === 0}
            onClick={() => navigateHistory(-1)}
            data-automation-id={AUTOMATION_IDS.guidebook.back}
          >
            <ArrowLeft />
          </button>
          <button
            type="button"
            aria-label={t('guidebook.forward')}
            disabled={history.index >= history.entries.length - 1}
            onClick={() => navigateHistory(1)}
            data-automation-id={AUTOMATION_IDS.guidebook.forward}
          >
            <ArrowRight />
          </button>
          <button
            type="button"
            aria-label={t('guidebook.refresh')}
            onClick={reload}
            data-automation-id={AUTOMATION_IDS.guidebook.refresh}
          >
            <RefreshCw />
          </button>
        </div>
        <div className={styles.address}>
          <BookOpen />
          <span>{t('guidebook.title')}</span>
          <small>{`${displayUrl.host}${displayUrl.pathname}`}</small>
        </div>
        <div className={styles.actions}>
          <span className={styles.online}><i />{t('guidebook.online')}</span>
          <button
            type="button"
            disabled={loadState !== 'ready'}
            onClick={() => postToGuidebook(createGuidebookOpenSearchMessage())}
            data-automation-id={AUTOMATION_IDS.guidebook.search}
          >
            <Search />{t('guidebook.search')}
          </button>
          <button
            type="button"
            onClick={openInBrowser}
            data-automation-id={AUTOMATION_IDS.guidebook.openBrowser}
          >
            <ExternalLink />{t('guidebook.openBrowser')}
          </button>
          {openBrowserError && (
            <span className={styles.actionError} role="alert">
              {t('guidebook.openBrowserFailed')}
            </span>
          )}
        </div>
      </header>

      <div className={styles.content} data-parity="guidebook-content">
        <iframe
          key={generation}
          ref={iframeRef}
          className={styles.frame}
          src={frameSource}
          title={t('guidebook.title')}
          sandbox="allow-same-origin allow-scripts"
          referrerPolicy="no-referrer"
          onLoad={() => {
            clearLoadTimeout();
            setLoadState('ready');
            synchronizePreferences();
          }}
          onError={() => {
            clearLoadTimeout();
            setLoadState('error');
          }}
          data-visible={loadState === 'ready'}
          data-automation-id={AUTOMATION_IDS.guidebook.frame}
        />
        {loadState === 'loading' && (
          <div className={styles.centered} role="status" data-automation-id={AUTOMATION_IDS.guidebook.loading}>
            <span className={styles.spinner} />
            <strong>{t('guidebook.loadingTitle')}</strong>
            <p>{t('guidebook.loadingDescription')}</p>
          </div>
        )}
        {loadState === 'error' && (
          <div className={styles.centered} role="alert" data-automation-id={AUTOMATION_IDS.guidebook.error}>
            <WifiOff />
            <strong>{t('guidebook.errorTitle')}</strong>
            <p>{t('guidebook.errorDescription')}</p>
            <div>
              <button type="button" onClick={reload} data-automation-id={AUTOMATION_IDS.guidebook.retry}>
                {t('guidebook.retry')}
              </button>
              <button type="button" onClick={openInBrowser}>
                {t('guidebook.openBrowser')}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
