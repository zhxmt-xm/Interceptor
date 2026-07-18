import { Clock, Menu, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, IconButton, Title } from '../../../components';
import { useComposerStore } from '../composerStore';
import styles from './ComposerTopbar.module.css';

export interface ComposerTopbarProps {
  onMenu?: () => void;
}

/** Composer topbar: sidebar toggle, title, history and new-request actions. */
export function ComposerTopbar({ onMenu }: ComposerTopbarProps): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const history = useComposerStore((state) => state.history);
  const loadFromHistory = useComposerStore((state) => state.loadFromHistory);
  const resetForNew = useComposerStore((state) => state.resetForNew);

  return (
    <>
      <IconButton icon={Menu} label={t('capture.toggleSidebar')} onClick={onMenu} />
      <Title>{t('composer.title')}</Title>
      <div className={styles.actions}>
        <div className={styles.historyWrap}>
          <Button icon={Clock} onClick={() => setOpen((value) => !value)}>
            {t('composer.history')}
          </Button>
          {open ? (
            <div className={styles.historyPanel}>
              {history.length === 0 ? (
                <div className={styles.historyEmpty}>{t('composer.noHistory')}</div>
              ) : (
                history.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={styles.historyItem}
                    onClick={() => {
                      loadFromHistory(entry);
                      setOpen(false);
                    }}
                  >
                    <span className={styles.historyMethod}>{entry.method}</span>
                    <span className={styles.historyUrl}>{entry.url}</span>
                    <span className={styles.historyStatus}>{entry.status || '—'}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
        <Button icon={Plus} onClick={resetForNew}>
          {t('composer.new')}
        </Button>
      </div>
    </>
  );
}
