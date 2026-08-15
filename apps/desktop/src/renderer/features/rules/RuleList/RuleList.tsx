import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { RuleNode } from '@interceptor/core-protocol';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { searchTree } from '../../../components';
import { useTreeDrag } from '../../../components/share/useTreeDrag';
import { useRulesStore } from '../data/rulesStore';
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
            data-automation-id="rules.root-menu-surface"
          />
        </RuleRootMenu>
        {drag.dropLine ? (
          <div className={styles.dropLine} style={drag.dropLine} />
        ) : null}
      </div>
    </div>
  );
}
