import { ChevronDown, MoreVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { MethodBadge } from '../../../components/MethodBadge/MethodBadge';
import { cx } from '../../../components/share/cx';
import { useComposerStore } from '../data/composerStore';
import type { CollectionNode } from '../interfaces';
import { anchorFolderMenu, countRequests } from '../utils';

import styles from './CollectionTreeNode.module.css';
import { RenameRow } from './RenameRow';

export interface CollectionTreeNodeProps {
  node: CollectionNode;
}

/** 集合树的一个节点：目录渲染成可折叠分组，请求渲染成单行。 */
export function CollectionTreeNode({
  node,
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
        className={cx(styles.item, activeRequestId === node.id && styles.active)}
        onClick={() => openRequest(node.id)}
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
        className={cx(
          styles.groupHead,
          targetFolderId === node.id && styles.target,
          folderMenu?.folderId === node.id && styles.menuOpen,
        )}
      >
        <button
          type="button"
          className={styles.chevronButton}
          aria-label={
            expanded ? t('composer.collapseFolder') : t('composer.expandFolder')
          }
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
          onClick={() => setTargetFolder(node.id)}
        >
          <span className={styles.groupName}>{node.name}</span>
        </button>
        <span className={styles.groupCount}>{countRequests(node.children)}</span>
        <button
          type="button"
          className={styles.more}
          aria-label={t('composer.folderActions')}
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
            <CollectionTreeNode key={child.id} node={child} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
