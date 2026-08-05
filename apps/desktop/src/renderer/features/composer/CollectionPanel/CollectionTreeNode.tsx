import { ChevronDown, MoreVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { countLeaves } from '@interceptor/core-protocol';

import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { MethodBadge } from '../../../components/MethodBadge/MethodBadge';
import { cx } from '../../../components/share/cx';
import type { TreeDragApi } from '../../../components/share/useTreeDrag';
import { useComposerStore } from '../data/composerStore';
import type { CollectionNode } from '../interfaces';
import { anchorFolderMenu } from '../utils';

import styles from './CollectionTreeNode.module.css';
import { RenameRow } from './RenameRow';

export interface CollectionTreeNodeProps {
  node: CollectionNode;
  drag: TreeDragApi;
}

/** 集合树的一个节点：目录渲染成可折叠分组，请求渲染成单行。 */
export function CollectionTreeNode({
  node,
  drag,
}: CollectionTreeNodeProps): React.JSX.Element {
  const { t } = useTranslation();
  const expandedFolders = useComposerStore((state) => state.expandedFolders);
  const targetFolderId = useComposerStore((state) => state.targetFolderId);
  const renamingNodeId = useComposerStore((state) => state.renamingNodeId);
  const folderMenu = useComposerStore((state) => state.folderMenu);
  const activeRequestId = useComposerStore((state) => state.activeRequestId);
  const toggleFolder = useComposerStore((state) => state.toggleFolder);
  const setTargetFolder = useComposerStore((state) => state.setTargetFolder);
  const setFolderMenu = useComposerStore((state) => state.setFolderMenu);
  const openRequest = useComposerStore((state) => state.openRequest);

  if (renamingNodeId === node.id) {
    return <RenameRow nodeId={node.id} name={node.name} />;
  }

  if (node.kind === 'request') {
    return (
      <button
        type="button"
        data-tree-row={node.id}
        data-automation-id={AutomationIdFactory.composerCollectionRequest(node.id)}
        className={cx(
          styles.item,
          activeRequestId === node.id && styles.active,
          drag.draggingId === node.id && styles.dragging,
        )}
        onClick={() => openRequest(node.id)}
        {...drag.rowProps(node.id)}
      >
        <MethodBadge method={node.method} className={styles.itemMethod} />
        <span className={styles.itemName}>{node.name}</span>
      </button>
    );
  }

  const expanded = expandedFolders.includes(node.id);
  return (
    <section className={styles.group}>
      <div
        data-tree-row={node.id}
        data-automation-id={AutomationIdFactory.composerCollectionFolder(node.id)}
        className={cx(
          styles.groupHead,
          targetFolderId === node.id && styles.target,
          folderMenu?.folderId === node.id && styles.menuOpen,
          drag.draggingId === node.id && styles.dragging,
          drag.intoFolderId === node.id && styles.dropTarget,
        )}
        {...drag.rowProps(node.id)}
      >
        <button
          type="button"
          className={styles.chevronButton}
          aria-label={
            expanded ? t('composer.collapseFolder') : t('composer.expandFolder')
          }
          data-automation-id={AutomationIdFactory.composerCollectionFolderToggle(node.id)}
          onClick={() => toggleFolder(node.id)}
        >
          <ChevronDown
            className={cx(styles.chevron, expanded && styles.expanded)}
            strokeWidth={1.9}
          />
        </button>
        <button
          type="button"
          className={styles.nameButton}
          data-automation-id={AutomationIdFactory.composerCollectionFolderTarget(node.id)}
          onClick={() => setTargetFolder(node.id)}
        >
          <span className={styles.groupName}>{node.name}</span>
        </button>
        <span className={styles.groupCount}>{countLeaves(node.children)}</span>
        <button
          type="button"
          className={styles.more}
          aria-label={t('composer.folderActions')}
          data-automation-id={AutomationIdFactory.composerCollectionFolderMenu(node.id)}
          onClick={(event) =>
            setFolderMenu(
              folderMenu?.folderId === node.id
                ? null
                : anchorFolderMenu(event.currentTarget, node.id),
            )
          }
        >
          <MoreVertical strokeWidth={1.9} />
        </button>
      </div>

      {expanded ? (
        <div className={styles.groupBody}>
          {node.children.map((child) => (
            <CollectionTreeNode key={child.id} node={child} drag={drag} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
