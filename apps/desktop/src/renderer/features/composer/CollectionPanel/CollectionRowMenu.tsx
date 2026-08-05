import { FilePlus, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { folderDepth, isFolder, MAX_FOLDER_DEPTH } from '@interceptor/core-protocol';

import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { TreeContextMenu, type TreeMenuItem } from '../../../components';
import { useComposerStore } from '../data/composerStore';
import type { CollectionNode } from '../interfaces';

export interface CollectionRowMenuProps {
  node: CollectionNode;
  /** 行尾 more 按钮的受控开关；右键由 Dropdown 自己接管。 */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactElement;
}

/** 集合树某一行的操作菜单：目录能新建与改名，请求只能改名与删除。 */
export function CollectionRowMenu({
  node,
  open,
  onOpenChange,
  children,
}: CollectionRowMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const nodes = useComposerStore((state) => state.nodes);
  const setRenamingNode = useComposerStore((state) => state.setRenamingNode);
  const setTargetFolder = useComposerStore((state) => state.setTargetFolder);
  const createFolder = useComposerStore((state) => state.createFolder);
  const createRequest = useComposerStore((state) => state.createRequest);
  const deleteNode = useComposerStore((state) => state.deleteNode);

  const items: TreeMenuItem[] = isFolder(node)
    ? [
        {
          key: 'rename',
          icon: Pencil,
          label: t('composer.renameFolder'),
          automationId: AutomationIdFactory.composerCollectionNodeAction(node.id, 'rename'),
          onSelect: () => setRenamingNode(node.id),
        },
        {
          key: 'new-folder',
          icon: FolderPlus,
          label: t('composer.newSubfolder'),
          disabled: folderDepth(nodes, node.id) >= MAX_FOLDER_DEPTH,
          automationId: AutomationIdFactory.composerCollectionNodeAction(node.id, 'new-folder'),
          onSelect: () => {
            setTargetFolder(node.id);
            createFolder(t('composer.untitledFolder'));
          },
        },
        {
          key: 'new-request',
          icon: FilePlus,
          label: t('composer.newRequest'),
          automationId: AutomationIdFactory.composerCollectionNodeAction(node.id, 'new-request'),
          onSelect: () => {
            setTargetFolder(node.id);
            createRequest();
          },
        },
        {
          key: 'delete',
          icon: Trash2,
          label: t('composer.deleteFolder'),
          danger: true,
          automationId: AutomationIdFactory.composerCollectionNodeAction(node.id, 'delete'),
          onSelect: () => deleteNode(node.id),
        },
      ]
    : [
        {
          key: 'rename',
          icon: Pencil,
          label: t('composer.renameRequest'),
          automationId: AutomationIdFactory.composerCollectionNodeAction(node.id, 'rename'),
          onSelect: () => setRenamingNode(node.id),
        },
        {
          key: 'delete',
          icon: Trash2,
          label: t('composer.deleteRequest'),
          danger: true,
          automationId: AutomationIdFactory.composerCollectionNodeAction(node.id, 'delete'),
          onSelect: () => deleteNode(node.id),
        },
      ];

  return (
    <TreeContextMenu items={items} open={open} onOpenChange={onOpenChange}>
      {children}
    </TreeContextMenu>
  );
}
