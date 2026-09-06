import { App } from 'antd';
import { Download, FolderPlus, Plus, Search, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { folderDepth, MAX_FOLDER_DEPTH } from '@interceptor/core-protocol';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import {
  FileTransferBusyOverlay,
  IconButton,
  searchTree,
} from '../../../components';
import { useTreeDrag } from '../../../components/share/useTreeDrag';
import { useCollectionImportStore } from '../data/collectionImportStore';
import { useComposerStore } from '../data/composerStore';
import { exportCollection } from '../data/useCollection';

import styles from './CollectionPanel.module.css';
import { CollectionTreeNode } from './CollectionTreeNode';

/** 左侧集合分栏：搜索、目录树与新建入口。 */
export function CollectionPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);
  const importPhase = useCollectionImportStore((state) => state.phase);
  const nodes = useComposerStore((state) => state.nodes);
  const savedNodes = useComposerStore((state) => state.savedNodes);
  const loaded = useComposerStore((state) => state.loaded);
  const saving = useComposerStore((state) => state.saving);
  const revision = useComposerStore((state) => state.revision);
  const targetFolderId = useComposerStore((state) => state.targetFolderId);
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

  const startExport = async (): Promise<void> => {
    setExporting(true);
    try {
      await exportCollection(t('composer.exportCollection'));
    } catch {
      void message.error(t('composer.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <aside
      className={styles.panel}
      data-automation-id={AUTOMATION_IDS.composer.collection}
      data-save-state={!loaded ? 'loading' : saving ? 'saving' : nodes === savedNodes ? 'saved' : 'pending'}
      data-revision={revision}
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
            icon={Upload}
            label={t('composer.importCollection')}
            size="sm"
            loading={importPhase === 'reading'}
            disabled={importPhase !== 'idle' || exporting}
            onClick={() => {
              void window.interceptor.importCollection().catch(() => {
                void message.error(t('composer.import.failed'));
              });
            }}
            automationId={AUTOMATION_IDS.composer.importCollection}
          />
          <IconButton
            icon={Download}
            label={t('composer.exportCollection')}
            size="sm"
            loading={exporting}
            disabled={nodes.length === 0 || importPhase !== 'idle' || exporting}
            onClick={() => {
              void startExport();
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

      <FileTransferBusyOverlay
        open={exporting}
        title={t('composer.export.writing')}
        detail={t('composer.export.writingDetail')}
        automationId={AUTOMATION_IDS.composer.exportBusy}
      />
    </aside>
  );
}
