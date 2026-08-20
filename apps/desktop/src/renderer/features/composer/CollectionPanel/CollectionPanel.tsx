import { App } from 'antd';
import { Download, FolderPlus, Plus, Search, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { folderDepth, MAX_FOLDER_DEPTH } from '@interceptor/core-protocol';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import {
  FileTransferBusyOverlay,
  IconButton,
  ImportConfirmDialog,
  searchTree,
} from '../../../components';
import { useTreeDrag } from '../../../components/share/useTreeDrag';
import { useComposerStore } from '../data/composerStore';
import {
  analyzeCollectionImport,
  exportCollection,
  importCollection,
} from '../data/useCollection';
import type { CollectionImportPreview } from '../interfaces';

import styles from './CollectionPanel.module.css';
import { CollectionTreeNode } from './CollectionTreeNode';

/** 左侧集合分栏：搜索、目录树与新建入口。 */
export function CollectionPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [query, setQuery] = useState('');
  const [importPreview, setImportPreview] = useState<CollectionImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [fileOperation, setFileOperation] = useState<'import' | 'export' | null>(null);
  const nodes = useComposerStore((state) => state.nodes);
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

  const startImport = async (): Promise<void> => {
    setFileOperation('import');
    let preview: CollectionImportPreview | null;
    try {
      preview = await analyzeCollectionImport(t('composer.importCollection'));
    } catch {
      void message.error(t('composer.import.readFailed'));
      return;
    } finally {
      setFileOperation(null);
    }
    if (!preview) {
      return;
    }
    if (!preview.ok) {
      void message.error(t(`import.reason.${preview.reason}`));
      return;
    }
    setImportPreview(preview);
  };

  const startExport = async (): Promise<void> => {
    setFileOperation('export');
    try {
      await exportCollection(t('composer.exportCollection'));
    } catch {
      void message.error(t('composer.exportFailed'));
    } finally {
      setFileOperation(null);
    }
  };

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
            icon={Upload}
            label={t('composer.importCollection')}
            size="sm"
            loading={fileOperation === 'import'}
            disabled={fileOperation !== null}
            onClick={() => {
              void startImport();
            }}
            automationId={AUTOMATION_IDS.composer.importCollection}
          />
          <IconButton
            icon={Download}
            label={t('composer.exportCollection')}
            size="sm"
            loading={fileOperation === 'export'}
            disabled={nodes.length === 0 || fileOperation !== null}
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

      {importPreview?.ok ? (
        <ImportConfirmDialog
          open
          title={t('composer.import.title')}
          summary={t('composer.import.summary', {
            requests: importPreview.leafCount,
            folders: importPreview.folderCount,
          })}
          fileName={importPreview.fileName}
          stats={[
            {
              label: t('composer.import.requests'),
              value: importPreview.leafCount,
              automationId: AUTOMATION_IDS.composer.import.requestCount,
            },
            {
              label: t('composer.import.folders'),
              value: importPreview.folderCount,
              automationId: AUTOMATION_IDS.composer.import.folderCount,
            },
            {
              label: t('composer.import.skipped'),
              value: importPreview.skipped.length,
              emphasis: 'skipped',
              automationId: AUTOMATION_IDS.composer.import.skippedCount,
            },
          ]}
          skipped={importPreview.skipped}
          skippedTitle={t('composer.import.skippedTitle', {
            count: importPreview.skipped.length,
          })}
          skippedMore={(count) => t('import.skippedMore', { count })}
          describeReason={(reason) => t(`import.reason.${reason}`)}
          cancelLabel={t('composer.import.cancel')}
          confirmLabel={t('composer.import.confirm', { count: importPreview.leafCount })}
          confirmWidth={196}
          confirmDisabled={importPreview.leafCount === 0 && importPreview.folderCount === 0}
          busy={importing}
          onCancel={() => setImportPreview(null)}
          onConfirm={() => {
            setImporting(true);
            void importCollection(importPreview.nodes).then((imported) => {
              if (imported) {
                setImportPreview(null);
              } else {
                void message.error(t('composer.import.failed'));
              }
            }).finally(() => setImporting(false));
          }}
          automationIds={{
            dialog: AUTOMATION_IDS.composer.import.dialog,
            fileName: AUTOMATION_IDS.composer.import.fileName,
            skippedList: AUTOMATION_IDS.composer.import.skippedList,
            cancel: AUTOMATION_IDS.composer.import.cancel,
            confirm: AUTOMATION_IDS.composer.import.confirm,
          }}
        />
      ) : null}
      <FileTransferBusyOverlay
        open={fileOperation !== null}
        title={fileOperation === 'import'
          ? t('composer.import.reading')
          : t('composer.export.writing')}
        detail={fileOperation === 'import'
          ? t('composer.import.readingDetail')
          : t('composer.export.writingDetail')}
        automationId={fileOperation === 'import'
          ? AUTOMATION_IDS.composer.import.busy
          : AUTOMATION_IDS.composer.exportBusy}
      />
    </aside>
  );
}
