import { Download, FolderPlus, Plus, RotateCcw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { RuleNode } from '@interceptor/core-protocol';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { IconButton, searchTree } from '../../../components';
import { useTreeDrag } from '../../../components/share/useTreeDrag';
import { useRulesStore } from '../data/rulesStore';
import { exportRules, loadRules } from '../data/useRulesData';
import { RuleFolderMenu } from '../RuleFolderMenu/RuleFolderMenu';
import { RuleTreeNode } from '../RuleTreeNode/RuleTreeNode';
import styles from './RuleList.module.css';

/** 规则树：目录只做组织，规则按树的深度优先顺序执行。 */
export function RuleList(): React.JSX.Element {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const nodes = useRulesStore((state) => state.nodes);
  const conflict = useRulesStore((state) => state.conflict);
  const addRule = useRulesStore((state) => state.addRule);
  const addFolder = useRulesStore((state) => state.addFolder);
  const moveNode = useRulesStore((state) => state.moveNode);
  const expandFolder = useRulesStore((state) => state.expandFolder);
  const setFolderMenu = useRulesStore((state) => state.setFolderMenu);

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
            automationId={AUTOMATION_IDS.rules.create}
          />
          <IconButton
            icon={FolderPlus}
            label={t('rules.newFolder')}
            size="sm"
            onClick={() => addFolder(t('rules.newFolderName'))}
            automationId={AUTOMATION_IDS.rules.createFolder}
          />
          <IconButton
            icon={Download}
            label={t('rules.exportRules')}
            size="sm"
            disabled={nodes.length === 0}
            onClick={() => {
              void exportRules(t('rules.exportRules'));
            }}
            automationId={AUTOMATION_IDS.rules.exportRules}
          />
          {conflict ? (
            // 冲突时本地草稿被保留；Reload 是用户显式放弃草稿、取回最新规则集的唯一入口。
            <IconButton
              icon={RotateCcw}
              label={t('rules.reloadFromCore')}
              size="sm"
              strokeWidth={2.4}
              onClick={() => void loadRules()}
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
        onClick={() => setFolderMenu(null)}
        {...drag.containerProps}
      >
        {search.empty ? (
          <div className={styles.empty}>{t('rules.searchEmpty')}</div>
        ) : visible.length === 0 ? (
          <div className={styles.empty}>{t('rules.empty')}</div>
        ) : (
          visible.map((node) => (
            <RuleTreeNode key={node.id} node={node} depth={0} drag={drag} search={search} />
          ))
        )}
        {drag.dropLine ? (
          <div className={styles.dropLine} style={drag.dropLine} />
        ) : null}
        <RuleFolderMenu />
      </div>
    </div>
  );
}
