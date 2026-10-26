import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../shared/automation-ids';
import { IconButton } from '../../../components/IconButton/IconButton';
import { MethodBadge } from '../../../components/MethodBadge/MethodBadge';
import { cx } from '../../../components/share/cx';
import { useComposerStore } from '../data/composerStore';
import type { HistoryEntry } from '../interfaces';
import { relativeTime, statusTone } from '../utils';

import styles from './RecentSends.module.css';

export interface RecentSendsProps {
  /** 选中一条历史后把 method / URL 回填到当前请求。 */
  onReplay: (entry: HistoryEntry) => void;
}

/** URL 行下方的重放记录弹层；与 Collection 是两件独立的事，互不写入。 */
export function RecentSends({ onReplay }: RecentSendsProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const history = useComposerStore((state) => state.history);
  const clearHistory = useComposerStore((state) => state.clearHistory);

  return (
    <div
      className={styles.history}
      data-automation-id={AUTOMATION_IDS.composer.historyList}
    >
      <div className={styles.head}>
        {t('composer.recentSends')}
        <IconButton
          icon={Trash2}
          label={t('composer.clearHistory')}
          size="sm"
          onClick={clearHistory}
        />
      </div>
      {history.length === 0 ? (
        <div className={styles.empty}>{t('composer.noHistory')}</div>
      ) : (
        history.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={styles.row}
            data-automation-id={AutomationIdFactory.composerHistoryRow(entry.id)}
            data-ok={entry.ok}
            data-status={entry.status}
            data-duration-ms={entry.durationMs}
            onClick={() => onReplay(entry)}
          >
            <MethodBadge method={entry.method} />
            <span className={styles.url}>{entry.url}</span>
            <span
              className={cx(styles.status, styles[statusTone(entry.status)])}
            >
              {entry.status || 'ERR'}
            </span>
            <span className={styles.time}>
              {relativeTime(entry.at, i18n.language)}
            </span>
          </button>
        ))
      )}
    </div>
  );
}
