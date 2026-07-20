import { Clock, Menu, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { IconButton, Title, useDismissOnOutside } from '../../../components';
import { useComposerStore } from '../composerStore';
import styles from './ComposerTopbar.module.css';

export interface ComposerTopbarProps {
  onMenu?: () => void;
}

/** Composer topbar: sidebar toggle, title, history and new-request actions. */
export function ComposerTopbar({ onMenu }: ComposerTopbarProps): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const historyWrapRef = useRef<HTMLDivElement>(null);
  const history = useComposerStore((state) => state.history);
  const loadFromHistory = useComposerStore((state) => state.loadFromHistory);
  const resetForNew = useComposerStore((state) => state.resetForNew);

  useDismissOnOutside(open, () => setOpen(false), [historyWrapRef]);

  return (
    <>
      <IconButton icon={Menu} label={t('capture.toggleSidebar')} onClick={onMenu} />
      <Title>{t('composer.title')}</Title>
      <div className={styles.actions}>
        <div ref={historyWrapRef} className={styles.historyWrap}>
          <IconButton
            icon={Clock}
            label={t('composer.history')}
            size="sm"
            onClick={() => setOpen((value) => !value)}
          />
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
        <IconButton icon={Plus} label={t('composer.new')} size="sm" onClick={resetForNew} />
      </div>
    </>
  );
}
