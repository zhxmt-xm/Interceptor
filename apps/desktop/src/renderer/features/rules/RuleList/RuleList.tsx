import { Download, FolderPlus, Plus, RotateCcw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { RuleNode } from '@interceptor/core-protocol';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { IconButton, searchTree } from '../../../components';
import { useTreeDrag } from '../../../components/share/useTreeDrag';
import { useRulesStore } from '../data/rulesStore';
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
  const [query, setQuery] = useState('');
  const [rootMenuOpen, setRootMenuOpen] = useState(false);
  const nodes = useRulesStore((state) => state.nodes);
  const conflict = useRulesStore((state) => state.conflict);
  const addRule = useRulesStore((state) => state.addRule);
  const addFolder = useRulesStore((state) => state.addFolder);
  const moveNode = useRulesStore((state) => state.moveNode);
  const expandFolder = useRulesStore((state) => state.expandFolder);

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
            icon={Download}
            label={t('rules.exportRules')}
            size="sm"
            disabled={nodes.length === 0}
            onClick={() => {
              void exportRules(t('rules.exportRules'));
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
        <RuleRootMenu open={rootMenuOpen} onOpenChange={setRootMenuOpen}>
          <div
            className={styles.rootMenuSurface}
            data-automation-id={AUTOMATION_IDS.rules.rootMenuSurface}
          />
        </RuleRootMenu>
        {drag.dropLine ? (
          <div className={styles.dropLine} style={drag.dropLine} />
        ) : null}
      </div>
    </div>
  );
}
