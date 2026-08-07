import { Modal } from 'antd';
import {
  AppWindow,
  RefreshCw,
  Search,
  Shield,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  AppContainerAccessInfo,
  AppContainerAccessSnapshot,
} from '../../../../shared/desktop-api';
import {
  Button,
  IconButton,
  InputBox,
  StatusBadge,
  Switch,
} from '../../../components';
import { describeError } from '../utils';

import styles from './AppContainerPanel.module.css';

type PanelState = 'loading' | 'ready' | 'error';

interface PendingChange {
  readonly appContainer: AppContainerAccessInfo;
  readonly enabled: boolean;
}

/** Windows AppContainer loopback exemption manager backed by Main's native service. */
export function AppContainerPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<AppContainerAccessSnapshot | null>(null);
  const [state, setState] = useState<PanelState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());

  useEffect(() => {
    let active = true;
    void window.interceptor.listAppContainers()
      .then((nextSnapshot) => {
        if (active) {
          setSnapshot(nextSnapshot);
          setState('ready');
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(describeError(reason));
          setState('error');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const refresh = (): void => {
    if (refreshing || changing) {
      return;
    }
    setRefreshing(true);
    setError(null);
    void window.interceptor.listAppContainers()
      .then((nextSnapshot) => {
        setSnapshot(nextSnapshot);
        setState('ready');
      })
      .catch((reason: unknown) => setError(describeError(reason)))
      .finally(() => setRefreshing(false));
  };

  const applyPendingChange = (): void => {
    if (!pendingChange || changing) {
      return;
    }
    setChanging(true);
    setError(null);
    void window.interceptor.setAppContainerLoopbackExemption(
      pendingChange.appContainer.appContainerSid,
      pendingChange.enabled,
    )
      .then((nextSnapshot) => {
        setSnapshot(nextSnapshot);
        setPendingChange(null);
      })
      .catch((reason: unknown) => setError(describeError(reason)))
      .finally(() => setChanging(false));
  };

  const containers = snapshot?.containers ?? [];
  const filteredContainers = deferredSearch
    ? containers.filter((appContainer) => [
        appContainer.displayName,
        appContainer.packageFamilyName,
        appContainer.packageFullName,
        appContainer.appContainerSid,
      ].some((value) => value?.toLocaleLowerCase().includes(deferredSearch)))
    : containers;
  const enabledCount = containers.filter((appContainer) => appContainer.exempt).length;

  if (state === 'loading') {
    return (
      <>
        <h2 className={styles.title}>{t('settings.appContainers.title')}</h2>
        <div className={styles.desc}>{t('settings.appContainers.loading')}</div>
      </>
    );
  }

  if (state === 'error' && !snapshot) {
    return (
      <>
        <h2 className={styles.title}>{t('settings.appContainers.title')}</h2>
        <div className={styles.desc}>{t('settings.appContainers.unavailable')}</div>
        {error ? <div className={styles.error} role="alert">{error}</div> : null}
      </>
    );
  }

  return (
    <>
      <h2 className={styles.title}>
        {t('settings.appContainers.title')}
        <StatusBadge tone="info">{t('settings.appContainers.windows')}</StatusBadge>
      </h2>
      <div className={styles.desc}>{t('settings.appContainers.description')}</div>

      <div className={styles.warning}>
        <Shield aria-hidden="true" />
        <div>
          <b>{t('settings.appContainers.adminRequired')}</b>
          <span>{t('settings.appContainers.scopeWarning')}</span>
        </div>
      </div>

      {snapshot?.supported ? (
        <>
          <div className={styles.toolbar}>
            <InputBox
              className={styles.search}
              value={search}
              onValueChange={setSearch}
              placeholder={t('settings.appContainers.searchPlaceholder')}
              ariaLabel={t('settings.appContainers.searchLabel')}
            >
              <Search size={14} strokeWidth={1.9} aria-hidden="true" />
            </InputBox>
            <span className={styles.count}>
              {t('settings.appContainers.count', {
                enabled: enabledCount,
                total: containers.length,
              })}
            </span>
            <IconButton
              icon={RefreshCw}
              label={t('settings.appContainers.refresh')}
              size="sm"
              loading={refreshing}
              disabled={changing}
              onClick={refresh}
            />
          </div>

          <div className={styles.list}>
            <div className={styles.listHead}>
              <span>{t('settings.appContainers.groupTitle')}</span>
              <span>{t('settings.appContainers.sidIdentity')}</span>
            </div>
            {filteredContainers.map((appContainer) => {
              const recommended = appContainer.packageFamilyName
                ?.startsWith('Microsoft.AAD.BrokerPlugin_') === true;
              const name = appContainer.displayName
                || appContainer.packageFamilyName
                || appContainer.appContainerSid;
              return (
                <div className={styles.row} key={appContainer.appContainerSid}>
                  <span className={recommended ? styles.recommendedIcon : styles.icon}>
                    <AppWindow aria-hidden="true" />
                  </span>
                  <div className={styles.identity}>
                    <div className={styles.nameLine}>
                      <b>{name}</b>
                      {recommended ? (
                        <span className={styles.recommended}>
                          {t('settings.appContainers.recommended')}
                        </span>
                      ) : null}
                    </div>
                    <span className={styles.packageName}>
                      {appContainer.packageFamilyName ?? t('settings.appContainers.noPackage')}
                    </span>
                    <code>{appContainer.appContainerSid}</code>
                  </div>
                  <div className={styles.control}>
                    <span>{appContainer.exempt
                      ? t('settings.appContainers.enabled')
                      : t('settings.off')}</span>
                    <Switch
                      checked={appContainer.exempt}
                      disabled={refreshing || changing}
                      onChange={(enabled) => setPendingChange({ appContainer, enabled })}
                    />
                  </div>
                </div>
              );
            })}
            {filteredContainers.length === 0 ? (
              <div className={styles.empty}>
                <Search aria-hidden="true" />
                <b>{t('settings.appContainers.noMatches')}</b>
                <span>{t('settings.appContainers.noMatchesHint')}</span>
              </div>
            ) : null}
          </div>

          <div className={styles.note}>
            <RefreshCw aria-hidden="true" />
            <span>{t('settings.appContainers.refreshHint')}</span>
          </div>
        </>
      ) : (
        <div className={styles.unsupported}>
          {t('settings.appContainers.unsupported')}
        </div>
      )}

      {error ? <div className={styles.error} role="alert">{error}</div> : null}

      <Modal
        open={pendingChange !== null}
        centered
        width={540}
        closable={false}
        footer={null}
        title={null}
        mask={{ closable: !changing }}
        keyboard={!changing}
        destroyOnHidden
        onCancel={() => {
          if (!changing) {
            setPendingChange(null);
          }
        }}
        classNames={{ container: styles.dialog, body: styles.dialogBody }}
        styles={{
          container: { padding: 0, border: '1px solid var(--border-2)' },
          body: { padding: 0, lineHeight: 1.23 },
        }}
        aria-labelledby="app-container-confirm-title"
      >
        <header className={styles.dialogHeader}>
          <span className={styles.dialogIcon}><Shield aria-hidden="true" /></span>
          <h2 id="app-container-confirm-title">
            {pendingChange?.enabled
              ? t('settings.appContainers.allowTitle')
              : t('settings.appContainers.removeTitle')}
          </h2>
          <IconButton
            icon={X}
            label={t('settings.cancel')}
            size="sm"
            disabled={changing}
            onClick={() => setPendingChange(null)}
          />
        </header>
        <div className={styles.dialogContent}>
          <p>{t(
            pendingChange?.enabled
              ? 'settings.appContainers.allowDescription'
              : 'settings.appContainers.removeDescription',
            {
              name: pendingChange?.appContainer.displayName
                || pendingChange?.appContainer.packageFamilyName
                || pendingChange?.appContainer.appContainerSid,
            },
          )}</p>
          <div className={styles.sidBox}>
            <span>{t('settings.appContainers.sidLabel')}</span>
            <code>{pendingChange?.appContainer.appContainerSid}</code>
          </div>
          <div className={styles.dialogWarning}>
            <TriangleAlert aria-hidden="true" />
            <span>{t('settings.appContainers.confirmWarning')}</span>
          </div>
          <div className={styles.dialogNote}>
            <Shield aria-hidden="true" />
            <span>{t('settings.appContainers.uacNotice')}</span>
          </div>
        </div>
        <footer className={styles.dialogFooter}>
          <Button disabled={changing} onClick={() => setPendingChange(null)}>
            {t('settings.cancel')}
          </Button>
          <Button
            icon={Shield}
            variant="primary"
            loading={changing}
            onClick={applyPendingChange}
          >
            {pendingChange?.enabled
              ? t('settings.appContainers.continueApproval')
              : t('settings.appContainers.removeApproval')}
          </Button>
        </footer>
      </Modal>
    </>
  );
}