import { App } from 'antd';
import { Download, FolderPlus, Plus, RotateCcw, Search, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { RuleNode } from '@interceptor/core-protocol';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import {
  FileTransferBusyOverlay,
  IconButton,
  ImportConfirmDialog,
  searchTree,
} from '../../../components';
import { useTreeDrag } from '../../../components/share/useTreeDrag';
import { useRulesStore } from '../data/rulesStore';
import { analyzeRuleImport, exportRules, importRules, loadRules } from '../data/useRulesData';
import type { RuleImportPreview } from '../interfaces';
import { RuleTreeNode } from '../RuleTreeNode/RuleTreeNode';
import { RuleRootMenu } from './RuleRootMenu';
import styles from './RuleList.module.css';

export interface RuleListProps {
  onShowRuleRequests: (ruleId: string) => void;
}

/** 规则树：目录只做组织，规则按树的深度优先顺序执行。 */
export function RuleList({ onShowRuleRequests }: RuleListProps): React.JSX.Element {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [query, setQuery] = useState('');
  const [rootMenuOpen, setRootMenuOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<RuleImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [fileOperation, setFileOperation] = useState<'import' | 'export' | null>(null);
  const nodes = useRulesStore((state) => state.nodes);
  const conflict = useRulesStore((state) => state.conflict);
  const addRule = useRulesStore((state) => state.addRule);
  const addFolder = useRulesStore((state) => state.addFolder);
  const moveNode = useRulesStore((state) => state.moveNode);
  const expandFolder = useRulesStore((state) => state.expandFolder);

  const startImport = async (): Promise<void> => {
    setRootMenuOpen(false);
    setFileOperation('import');
    let preview: RuleImportPreview | null;
    try {
      preview = await analyzeRuleImport(t('rules.importRules'));
    } catch {
      void message.error(t('rules.import.readFailed'));
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
    setRootMenuOpen(false);
    setFileOperation('export');
    try {
      await exportRules(t('rules.exportRules'));
    } catch {
      void message.error(t('rules.exportFailed'));
    } finally {
      setFileOperation(null);
    }
  };

  const search = useMemo(() => searchTree(nodes, query), [nodes, query]);
  const visible: readonly RuleNode[] = nodes;

  const drag = useTreeDrag({
    nodes,
    disabled: search.visible !== null,
    onMove: moveNode,
    onAutoExpand: expandFolder,
  });

  return (
    <div className={styles.list}>
      <div className={styles.bar}>
        <label className={styles.search}>
          <Search aria-hidden="true" />
          <input
            value={query}
            aria-label={t('rules.searchRules')}
            placeholder={t('rules.searchRules')}
            onChange={(event) => setQuery(event.target.value)}
            data-automation-id={AUTOMATION_IDS.rules.search}
          />
        </label>
        <div className={styles.actions}>
          <IconButton
            icon={Plus}
            label={t('rules.newRule')}
            size="sm"
            onClick={() => addRule(t('rules.newRuleName'))}
            automationId={AUTOMATION_IDS.rules.toolbar.create}
          />
          <IconButton
            icon={FolderPlus}
            label={t('rules.newFolder')}
            size="sm"
            onClick={() => addFolder(t('rules.newFolderName'))}
            automationId={AUTOMATION_IDS.rules.toolbar.createFolder}
          />
          <IconButton
            icon={Upload}
            label={t('rules.importRules')}
            size="sm"
            loading={fileOperation === 'import'}
            disabled={fileOperation !== null}
            onClick={() => {
              void startImport();
            }}
            automationId={AUTOMATION_IDS.rules.toolbar.importRules}
          />
          <IconButton
            icon={Download}
            label={t('rules.exportRules')}
            size="sm"
            loading={fileOperation === 'export'}
            disabled={nodes.length === 0 || fileOperation !== null}
            onClick={() => {
              void startExport();
            }}
            automationId={AUTOMATION_IDS.rules.toolbar.exportRules}
          />
          {conflict ? (
            <IconButton
              icon={RotateCcw}
              label={t('rules.reloadFromCore')}
              size="sm"
              strokeWidth={2.4}
              onClick={() => {
                void loadRules();
              }}
              automationId={AUTOMATION_IDS.rules.reload}
            />
          ) : null}
        </div>
      </div>

      <div
        ref={drag.containerRef}
        data-tree-scroll
        data-automation-id={AUTOMATION_IDS.rules.list}
        className={styles.rows}
        {...drag.containerProps}
      >
        {search.empty ? (
          <div className={styles.empty}>{t('rules.searchEmpty')}</div>
        ) : visible.length === 0 ? (
          <div className={styles.empty}>{t('rules.empty')}</div>
        ) : (
          visible.map((node) => (
            <RuleTreeNode
              key={node.id}
              node={node}
              depth={0}
              drag={drag}
              search={search}
              onShowRuleRequests={onShowRuleRequests}
            />
          ))
        )}
        <RuleRootMenu
          open={rootMenuOpen}
          onOpenChange={setRootMenuOpen}
          onImport={() => {
            void startImport();
          }}
          onExport={() => {
            void startExport();
          }}
        >
          <div
            className={styles.rootMenuSurface}
            data-automation-id={AUTOMATION_IDS.rules.rootMenuSurface}
          />
        </RuleRootMenu>
        {drag.dropLine ? (
          <div className={styles.dropLine} style={drag.dropLine} />
        ) : null}
      </div>

      {importPreview?.ok ? (
        <ImportConfirmDialog
          open
          title={t('rules.import.title')}
          summary={t('rules.import.summary', {
            rules: importPreview.leafCount,
            folders: importPreview.folderCount,
          })}
          fileName={importPreview.fileName}
          stats={[
            {
              label: t('rules.import.rules'),
              value: importPreview.leafCount,
              automationId: AUTOMATION_IDS.rules.import.ruleCount,
            },
            {
              label: t('rules.import.folders'),
              value: importPreview.folderCount,
              automationId: AUTOMATION_IDS.rules.import.folderCount,
            },
            {
              label: t('rules.import.enabled'),
              value: importPreview.enabledCount,
              emphasis: 'enabled',
              automationId: AUTOMATION_IDS.rules.import.enabledCount,
            },
            {
              label: t('rules.import.skipped'),
              value: importPreview.skipped.length,
              emphasis: 'skipped',
              automationId: AUTOMATION_IDS.rules.import.skippedCount,
            },
          ]}
          skipped={importPreview.skipped}
          skippedTitle={t('rules.import.skippedTitle', {
            count: importPreview.skipped.length,
          })}
          skippedMore={(count) => t('import.skippedMore', { count })}
          describeReason={(reason) => t(`import.reason.${reason}`)}
          warning={importPreview.enabledCount > 0
            ? t('rules.import.enabledWarning', { count: importPreview.enabledCount })
            : undefined}
          cancelLabel={t('rules.import.cancel')}
          confirmLabel={t('rules.import.confirm', { count: importPreview.leafCount })}
          confirmWidth={172}
          confirmDisabled={importPreview.leafCount === 0 && importPreview.folderCount === 0}
          busy={importing}
          onCancel={() => setImportPreview(null)}
          onConfirm={() => {
            setImporting(true);
            void importRules(importPreview.nodes).then((imported) => {
              if (imported) {
                setImportPreview(null);
              } else {
                void message.error(t('rules.import.failed'));
              }
            }).finally(() => setImporting(false));
          }}
          automationIds={{
            dialog: AUTOMATION_IDS.rules.import.dialog,
            fileName: AUTOMATION_IDS.rules.import.fileName,
            skippedList: AUTOMATION_IDS.rules.import.skippedList,
            cancel: AUTOMATION_IDS.rules.import.cancel,
            confirm: AUTOMATION_IDS.rules.import.confirm,
          }}
        />
      ) : null}
      <FileTransferBusyOverlay
        open={fileOperation !== null}
        title={fileOperation === 'import'
          ? t('rules.import.reading')
          : t('rules.export.writing')}
        detail={fileOperation === 'import'
          ? t('rules.import.readingDetail')
          : t('rules.export.writingDetail')}
        automationId={fileOperation === 'import'
          ? AUTOMATION_IDS.rules.import.busy
          : AUTOMATION_IDS.rules.exportBusy}
      />
    </div>
  );
}
