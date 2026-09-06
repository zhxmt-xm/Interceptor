import { App } from 'antd';
import { Download, FolderPlus, Plus, RotateCcw, Search, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { RuleNode } from '@interceptor/core-protocol';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import {
  FileTransferBusyOverlay,
  IconButton,
  searchTree,
} from '../../../components';
import { useTreeDrag } from '../../../components/share/useTreeDrag';
import { useRulesStore } from '../data/rulesStore';
import { useRulesImportStore } from '../data/rulesImportStore';
import { exportRules, loadRules } from '../data/useRulesData';
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
  const [exporting, setExporting] = useState(false);
  const importPhase = useRulesImportStore((state) => state.phase);
  const nodes = useRulesStore((state) => state.nodes);
  const conflict = useRulesStore((state) => state.conflict);
  const addRule = useRulesStore((state) => state.addRule);
  const addFolder = useRulesStore((state) => state.addFolder);
  const moveNode = useRulesStore((state) => state.moveNode);
  const expandFolder = useRulesStore((state) => state.expandFolder);

  const startImport = async (): Promise<void> => {
    setRootMenuOpen(false);
    try {
      await window.interceptor.importRules();
    } catch {
      void message.error(t('rules.import.readFailed'));
    }
  };

  const startExport = async (): Promise<void> => {
    setRootMenuOpen(false);
    setExporting(true);
    try {
      await exportRules(t('rules.exportRules'));
    } catch {
      void message.error(t('rules.exportFailed'));
    } finally {
      setExporting(false);
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
            loading={importPhase === 'reading'}
            disabled={exporting || importPhase !== 'idle'}
            onClick={() => {
              void startImport();
            }}
            automationId={AUTOMATION_IDS.rules.toolbar.importRules}
          />
          <IconButton
            icon={Download}
            label={t('rules.exportRules')}
            size="sm"
            loading={exporting}
            disabled={nodes.length === 0 || exporting || importPhase !== 'idle'}
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

      <FileTransferBusyOverlay
        open={exporting}
        title={t('rules.export.writing')}
        detail={t('rules.export.writingDetail')}
        automationId={AUTOMATION_IDS.rules.exportBusy}
      />
    </div>
  );
}
