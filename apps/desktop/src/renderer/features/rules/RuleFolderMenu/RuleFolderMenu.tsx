import { FilePlus, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { fitsDepth, folderDepth } from '@interceptor/core-protocol';

import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { MenuItem } from '../../../components';
import { createFolder } from '../utils';
import { useRulesStore } from '../data/rulesStore';

import styles from './RuleFolderMenu.module.css';

/** 目录操作菜单：重命名、在目录内新建子目录或规则、删除整个目录。 */
export function RuleFolderMenu(): React.JSX.Element | null {
  const { t } = useTranslation();
  const nodes = useRulesStore((state) => state.nodes);
  const folderMenu = useRulesStore((state) => state.folderMenu);
  const beginRename = useRulesStore((state) => state.beginRename);
  const addFolder = useRulesStore((state) => state.addFolder);
  const addRule = useRulesStore((state) => state.addRule);
  const removeNode = useRulesStore((state) => state.removeNode);

  if (!folderMenu) {
    return null;
  }
  const { folderId, top, left } = folderMenu;
  // 已经是第三级目录时不能再往里放目录，但仍可以放规则。
  const canNest = fitsDepth(folderDepth(nodes, folderId), createFolder(''));

  return (
    <div
      className={styles.menu}
      style={{ top, left }}
      role="menu"
      data-automation-id={AutomationIdFactory.ruleFolderMenu(folderId)}
    >
      <MenuItem
        icon={Pencil}
        name={t('rules.renameFolder')}
        hint=""
        automationId={AutomationIdFactory.ruleFolderAction(folderId, 'rename')}
        onClick={() => beginRename(folderId)}
      />
      <MenuItem
        icon={FolderPlus}
        name={t('rules.newSubfolder')}
        hint=""
        disabled={!canNest}
        automationId={AutomationIdFactory.ruleFolderAction(folderId, 'new-folder')}
        onClick={() => addFolder(t('rules.newFolderName'), folderId)}
      />
      <MenuItem
        icon={FilePlus}
        name={t('rules.newRule')}
        hint=""
        automationId={AutomationIdFactory.ruleFolderAction(folderId, 'new-rule')}
        onClick={() => addRule(t('rules.newRuleName'), folderId)}
      />
      <div className={styles.separator} />
      <MenuItem
        icon={Trash2}
        name={t('rules.deleteFolder')}
        hint=""
        automationId={AutomationIdFactory.ruleFolderAction(folderId, 'delete')}
        onClick={() => removeNode(folderId)}
      />
    </div>
  );
}
