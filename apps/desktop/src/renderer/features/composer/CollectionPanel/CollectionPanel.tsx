import { Download, FilePlus, FolderPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { folderDepth, MAX_FOLDER_DEPTH } from '@interceptor/core-protocol';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { IconButton } from '../../../components/IconButton/IconButton';
import { useTreeDrag } from '../../../components/share/useTreeDrag';
import { useComposerStore } from '../data/composerStore';
import { exportCollection } from '../data/useCollection';

import styles from './CollectionPanel.module.css';
import { CollectionTreeNode } from './CollectionTreeNode';
import { FolderMenu } from './FolderMenu';

/** 左侧集合分栏：工具栏、目录树与目录操作菜单。 */
export function CollectionPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const nodes = useComposerStore((state) => state.nodes);
  const targetFolderId = useComposerStore((state) => state.targetFolderId);
  const folderMenu = useComposerStore((state) => state.folderMenu);
  const createRequest = useComposerStore((state) => state.createRequest);
  const createFolder = useComposerStore((state) => state.createFolder);
  const moveNode = useComposerStore((state) => state.moveNode);
  const expandFolder = useComposerStore((state) => state.expandFolder);
  const drag = useTreeDrag({ nodes, onMove: moveNode, onAutoExpand: expandFolder });
  const canCreateFolder = folderDepth(nodes, targetFolderId) < MAX_FOLDER_DEPTH;

  return (
    <aside
      className={styles.panel}
      data-automation-id={AUTOMATION_IDS.composer.collection}
    >
      <div className={styles.bar}>
        <span className={styles.title}>{t('composer.collection')}</span>
        <div className={styles.actions}>
          <IconButton
            icon={FolderPlus}
            label={t('composer.newFolder')}
            size="sm"
            disabled={!canCreateFolder}
            onClick={() => createFolder(t('composer.untitledFolder'))}
            automationId={AUTOMATION_IDS.composer.newFolder}
          />
          <IconButton
            icon={FilePlus}
            label={t('composer.newRequest')}
            size="sm"
            onClick={createRequest}
            automationId={AUTOMATION_IDS.composer.newRequest}
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
        {...drag.containerProps}
      >
        {nodes.map((node) => (
          <CollectionTreeNode key={node.id} node={node} drag={drag} />
        ))}
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
