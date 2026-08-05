import { Download, FolderPlus, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { folderDepth, MAX_FOLDER_DEPTH } from '@interceptor/core-protocol';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { IconButton, searchTree } from '../../../components';
import { useTreeDrag } from '../../../components/share/useTreeDrag';
import { useComposerStore } from '../data/composerStore';
import { exportCollection } from '../data/useCollection';

import styles from './CollectionPanel.module.css';
import { CollectionTreeNode } from './CollectionTreeNode';
import { FolderMenu } from './FolderMenu';

/** 左侧集合分栏：搜索、目录树与目录操作菜单。 */
export function CollectionPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const nodes = useComposerStore((state) => state.nodes);
  const targetFolderId = useComposerStore((state) => state.targetFolderId);
  const folderMenu = useComposerStore((state) => state.folderMenu);
  const createRequest = useComposerStore((state) => state.createRequest);
  const createFolder = useComposerStore((state) => state.createFolder);
  const moveNode = useComposerStore((state) => state.moveNode);
  const expandFolder = useComposerStore((state) => state.expandFolder);
  const clearSelection = useComposerStore((state) => state.clearSelection);
  const search = useMemo(() => searchTree(nodes, query), [nodes, query]);
  const drag = useTreeDrag({
    nodes,
    disabled: search.visible !== null,
    onMove: moveNode,
    onAutoExpand: expandFolder,
  });
  const canCreateFolder = folderDepth(nodes, targetFolderId) < MAX_FOLDER_DEPTH;

  return (
    <aside
      className={styles.panel}
      data-automation-id={AUTOMATION_IDS.composer.collection}
    >
      <div className={styles.bar}>
        <label className={styles.search}>
          <Search aria-hidden="true" />
          <input
            value={query}
            aria-label={t('composer.searchRequests')}
            placeholder={t('composer.searchRequests')}
            onChange={(event) => setQuery(event.target.value)}
            data-automation-id={AUTOMATION_IDS.composer.collectionSearch}
          />
        </label>
        <div className={styles.actions}>
          <IconButton
            icon={Plus}
            label={t('composer.newRequest')}
            size="sm"
            onClick={createRequest}
            automationId={AUTOMATION_IDS.composer.newRequest}
          />
          <IconButton
            icon={FolderPlus}
            label={t('composer.newFolder')}
            size="sm"
            disabled={!canCreateFolder}
            onClick={() => createFolder(t('composer.untitledFolder'))}
            automationId={AUTOMATION_IDS.composer.newFolder}
          />
          <IconButton
            icon={Download}
            label={t('composer.exportCollection')}
            size="sm"
            disabled={nodes.length === 0}
            onClick={() => {
              void exportCollection(t('composer.exportCollection'));
            }}
            automationId={AUTOMATION_IDS.composer.exportCollection}
          />
        </div>
      </div>

      <div
        ref={drag.containerRef}
        className={styles.scroll}
        data-automation-id={AUTOMATION_IDS.composer.collectionTree}
        onClick={(event) => {
          // 只有真的点在空白处才取消选择，点到行上的交给行自己处理
          if (event.target === event.currentTarget) {
            clearSelection();
          }
        }}
        {...drag.containerProps}
      >
        {search.empty ? (
          <div className={styles.empty}>{t('composer.searchEmpty')}</div>
        ) : (
          nodes.map((node) => (
            <CollectionTreeNode key={node.id} node={node} depth={0} drag={drag} search={search} />
          ))
        )}
        {drag.dropLine ? (
          <div className={styles.dropLine} style={drag.dropLine} />
        ) : null}
      </div>

      {folderMenu ? (
        <div
          className={styles.menu}
          style={{ top: folderMenu.top, left: folderMenu.left }}
        >
          <FolderMenu folderId={folderMenu.folderId} />
        </div>
      ) : null}
    </aside>
  );
}
