import { fitsDepth, folderDepth, type RuleFolder } from '@interceptor/core-protocol';
import { FilePlus, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { TreeContextMenu, type TreeMenuItem } from '../../../components';
import { useRulesStore } from '../data/rulesStore';
import { createFolder } from '../utils';

export interface RuleFolderMenuProps {
  folder: RuleFolder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactElement;
}

/** 目录行的右键菜单：改名、往目录里新建子目录或规则、删除整个目录。 */
export function RuleFolderMenu({
  folder,
  open,
  onOpenChange,
  children,
}: RuleFolderMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const nodes = useRulesStore((state) => state.nodes);
  const beginRename = useRulesStore((state) => state.beginRename);
  const addFolder = useRulesStore((state) => state.addFolder);
  const addRule = useRulesStore((state) => state.addRule);
  const removeNode = useRulesStore((state) => state.removeNode);

  const items: TreeMenuItem[] = [
    {
      key: 'rename',
      icon: Pencil,
      label: t('rules.renameFolder'),
      automationId: AutomationIdFactory.ruleNodeAction(folder.id, 'rename'),
      onSelect: () => beginRename(folder.id),
    },
    {
      key: 'new-folder',
      icon: FolderPlus,
      label: t('rules.newSubfolder'),
      // 已经是第三级目录时不能再往里放目录，但仍可以放规则。
      disabled: !fitsDepth(folderDepth(nodes, folder.id), createFolder('')),
      automationId: AutomationIdFactory.ruleNodeAction(folder.id, 'new-folder'),
      onSelect: () => addFolder(t('rules.newFolderName'), folder.id),
    },
    {
      key: 'new-rule',
      icon: FilePlus,
      label: t('rules.newRule'),
      automationId: AutomationIdFactory.ruleNodeAction(folder.id, 'new-rule'),
      onSelect: () => addRule(t('rules.newRuleName'), folder.id),
    },
    {
      key: 'delete',
      icon: Trash2,
      label: t('rules.deleteFolder'),
      danger: true,
      automationId: AutomationIdFactory.ruleNodeAction(folder.id, 'delete'),
      onSelect: () => removeNode(folder.id),
    },
  ];

  return (
    <TreeContextMenu items={items} open={open} onOpenChange={onOpenChange}>
      {children}
    </TreeContextMenu>
  );
}
