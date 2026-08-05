import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { useComposerStore } from '../data/composerStore';

import styles from './RenameRow.module.css';

export interface RenameRowProps {
  nodeId: string;
  name: string;
}

/** 行内重命名：进入时自动全选，Enter 提交、Esc 取消、失焦即提交。 */
export function RenameRow({ nodeId, name }: RenameRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const renameNode = useComposerStore((state) => state.renameNode);
  const setRenamingNode = useComposerStore((state) => state.setRenamingNode);

  const commit = (): void => {
    const next = inputRef.current?.value.trim();
    if (next) {
      renameNode(nodeId, next);
    } else {
      setRenamingNode(null);
    }
  };

  return (
    <div className={styles.rename}>
      <input
        ref={inputRef}
        className={styles.field}
        defaultValue={name}
        aria-label={t('composer.renameFolder')}
        data-automation-id={AutomationIdFactory.composerCollectionFolderRename(nodeId)}
        spellCheck={false}
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit();
          } else if (event.key === 'Escape') {
            setRenamingNode(null);
          }
        }}
      />
    </div>
  );
}
