import { ChevronDown, MoreVertical } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { countLeaves } from '@interceptor/core-protocol';

import { AutomationIdFactory } from '../../../../shared/automation-ids';
import type { TreeSearchResult } from '../../../components';
import { HighlightedName } from '../../../components';
import { MethodBadge } from '../../../components/MethodBadge/MethodBadge';
import { cx } from '../../../components/share/cx';
import type { TreeDragApi } from '../../../components/share/useTreeDrag';
import { useComposerStore } from '../data/composerStore';
import type { CollectionNode } from '../interfaces';

import { CollectionRowMenu } from './CollectionRowMenu';
import styles from './CollectionTreeNode.module.css';
import { RenameRow } from './RenameRow';

export interface CollectionTreeNodeProps {
  node: CollectionNode;
  /** 树深度，决定行内缩进；顶层为 0。 */
  depth: number;
  drag: TreeDragApi;
  search: TreeSearchResult;
}

/** 集合树的一个节点：目录渲染成可折叠分组，请求渲染成单行。 */
export function CollectionTreeNode({
  node,
  depth,
  drag,
  search,
}: CollectionTreeNodeProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const expandedFolders = useComposerStore((state) => state.expandedFolders);
  const targetFolderId = useComposerStore((state) => state.targetFolderId);
  const renamingNodeId = useComposerStore((state) => state.renamingNodeId);
  const activeRequestId = useComposerStore((state) => state.activeRequestId);
  const toggleFolder = useComposerStore((state) => state.toggleFolder);
  const setTargetFolder = useComposerStore((state) => state.setTargetFolder);
  const setRenamingNode = useComposerStore((state) => state.setRenamingNode);
  const openRequest = useComposerStore((state) => state.openRequest);

  if (search.visible !== null && !search.visible.has(node.id)) {
    return null;
  }
  const keyword = search.matched.has(node.id) ? search.keyword : '';

  if (renamingNodeId === node.id) {
    return <RenameRow nodeId={node.id} name={node.name} />;
  }

  if (node.kind === 'request') {
    return (
      <CollectionRowMenu node={node} open={menuOpen} onOpenChange={setMenuOpen}>
        <button
          type="button"
          aria-pressed={activeRequestId === node.id && targetFolderId === null}
          data-tree-row={node.id}
          data-automation-id={AutomationIdFactory.composerCollectionRequest(node.id)}
          style={{ '--depth': depth } as React.CSSProperties}
          className={cx(
            styles.item,
            activeRequestId === node.id &&
              (targetFolderId === null ? styles.active : styles.open),
            drag.draggingId === node.id && styles.dragging,
          )}
          onClick={() => openRequest(node.id)}
          onDoubleClick={() => setRenamingNode(node.id)}
          {...drag.rowProps(node.id)}
        >
          <MethodBadge method={node.method} className={styles.itemMethod} />
          <HighlightedName
            name={node.name}
            keyword={keyword}
            className={styles.itemName}
          />
        </button>
      </CollectionRowMenu>
    );
  }

  const expanded = search.visible !== null || expandedFolders.includes(node.id);
  return (
    <section className={styles.group}>
      <CollectionRowMenu node={node} open={menuOpen} onOpenChange={setMenuOpen}>
        <div
          data-tree-row={node.id}
          data-automation-id={AutomationIdFactory.composerCollectionFolder(node.id)}
          style={{ '--depth': depth } as React.CSSProperties}
          className={cx(
            styles.groupHead,
            targetFolderId === node.id && styles.target,
            menuOpen && styles.menuOpen,
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
            aria-pressed={targetFolderId === node.id}
            className={styles.nameButton}
            data-automation-id={AutomationIdFactory.composerCollectionFolderTarget(node.id)}
            onClick={() => setTargetFolder(node.id)}
            onDoubleClick={() => setRenamingNode(node.id)}
          >
            <HighlightedName
              name={node.name}
              keyword={keyword}
              className={styles.groupName}
            />
          </button>
          <span className={styles.groupCount}>{countLeaves(node.children)}</span>
          <button
            type="button"
            className={styles.more}
            aria-label={t('composer.folderActions')}
            data-automation-id={AutomationIdFactory.composerCollectionFolderMenu(node.id)}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <MoreVertical strokeWidth={1.9} />
          </button>
        </div>
      </CollectionRowMenu>

      {expanded ? (
        <div className={styles.groupBody}>
          {node.children.map((child) => (
            <CollectionTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              drag={drag}
              search={search}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
