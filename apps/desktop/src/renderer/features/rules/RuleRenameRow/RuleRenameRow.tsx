import { ChevronDown, FileText, Folder } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { useRulesStore } from '../data/rulesStore';

import styles from './RuleRenameRow.module.css';

export interface RuleRenameRowProps {
  nodeId: string;
  name: string;
  kind: 'folder' | 'rule';
  /** 树深度，与它替换掉的那一行保持同样缩进。 */
  depth: number;
}

/** 行内重命名：同一行变成输入框，没有弹层。Enter 提交，Esc 放弃。 */
export function RuleRenameRow({
  nodeId,
  name,
  kind,
  depth,
}: RuleRenameRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const [value, setValue] = useState(name);
  const renameNode = useRulesStore((state) => state.renameNode);
  const beginRename = useRulesStore((state) => state.beginRename);
  const commit = (): void => renameNode(nodeId, value.trim() || name);

  return (
    <div className={styles.row} style={{ '--depth': depth } as React.CSSProperties}>
      <ChevronDown className={styles.chevron} strokeWidth={1.9} />
      {kind === 'folder' ? (
        <Folder className={styles.icon} strokeWidth={1.9} />
      ) : (
        <FileText className={styles.icon} strokeWidth={1.9} />
      )}
      <input
        autoFocus
        className={styles.input}
        aria-label={t(kind === 'folder' ? 'rules.renameFolder' : 'rules.renameRule')}
        data-automation-id={
          kind === 'folder'
            ? AutomationIdFactory.ruleFolderRename(nodeId)
            : AutomationIdFactory.ruleRename(nodeId)
        }
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit();
          } else if (event.key === 'Escape') {
            beginRename(null);
          }
        }}
      />
    </div>
  );
}
