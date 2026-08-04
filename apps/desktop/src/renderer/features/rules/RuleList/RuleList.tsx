import { Check, FolderPlus, MoreHorizontal, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { collectLeaves, isFolder, type RuleNode } from '@interceptor/core-protocol';

import { Flyout, IconButton, MenuItem } from '../../../components';
import { useTreeDrag } from '../../../components/share/useTreeDrag';
import { useRulesStore } from '../data/rulesStore';
import { applyRules, loadRules } from '../data/useRulesData';
import { RuleFolderMenu } from '../RuleFolderMenu/RuleFolderMenu';
import { RuleTreeNode } from '../RuleTreeNode/RuleTreeNode';
import { isRulesDirty } from '../utils';
import styles from './RuleList.module.css';

/** 规则树：目录只做组织，规则按树的深度优先顺序执行。 */
export function RuleList(): React.JSX.Element {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const nodes = useRulesStore((state) => state.nodes);
  const dirty = useRulesStore((state) => isRulesDirty(state.nodes, state.applied));
  const saving = useRulesStore((state) => state.saving);
  const conflict = useRulesStore((state) => state.conflict);
  const selectedId = useRulesStore((state) => state.selectedId);
  const addRule = useRulesStore((state) => state.addRule);
  const addFolder = useRulesStore((state) => state.addFolder);
  const removeNode = useRulesStore((state) => state.removeNode);
  const beginRename = useRulesStore((state) => state.beginRename);
  const moveNode = useRulesStore((state) => state.moveNode);
  const toggleFolder = useRulesStore((state) => state.toggleFolder);
  const setFolderMenu = useRulesStore((state) => state.setFolderMenu);

  const normalizedQuery = query.trim().toLowerCase();
  // 搜索是跨目录的：命中结果拍平成一层，因此搜索期间没有目录、也不排序。
  const matches = useMemo(
    () =>
      normalizedQuery
        ? collectLeaves(nodes).filter((rule) =>
            rule.name.toLowerCase().includes(normalizedQuery)
            || JSON.stringify(rule.matchers).toLowerCase().includes(normalizedQuery)
            || JSON.stringify(rule.actions).toLowerCase().includes(normalizedQuery))
        : null,
    [nodes, normalizedQuery],
  );
  const visible: readonly RuleNode[] = matches ?? nodes;

  const drag = useTreeDrag({ nodes, onMove: moveNode, onAutoExpand: toggleFolder });

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
          />
        </label>
        <div className={styles.actions}>
          <IconButton
            icon={Plus}
            label={t('rules.newRule')}
            size="sm"
            onClick={() => addRule(t('rules.newRuleName'))}
          />
          <IconButton
            icon={FolderPlus}
            label={t('rules.newFolder')}
            size="sm"
            onClick={() => addFolder(t('rules.newFolderName'))}
          />
          <IconButton
            icon={Check}
            label={saving ? t('rules.applying') : t('rules.applyChanges')}
            size="sm"
            strokeWidth={2.4}
            disabled={!dirty || saving}
            onClick={() => void applyRules()}
          />
          {conflict ? (
            // 冲突时本地草稿被保留；Reload 是用户显式放弃草稿、取回最新规则集的唯一入口。
            <IconButton
              icon={RotateCcw}
              label={t('rules.reloadFromCore')}
              size="sm"
              strokeWidth={2.4}
              onClick={() => void loadRules()}
            />
          ) : null}
          <Flyout
            open={moreOpen}
            onOpenChange={setMoreOpen}
            placement="bottomRight"
            className={styles.moreMenu}
            content={
              <>
                <MenuItem
                  icon={Trash2}
                  name={t('rules.deleteRule')}
                  hint=""
                  onClick={() => {
                    if (selectedId) {
                      removeNode(selectedId);
                    }
                    setMoreOpen(false);
                  }}
                />
              </>
            }
          >
            <span className={styles.menuAnchor}>
              <IconButton
                icon={MoreHorizontal}
                label={t('rules.more')}
                size="sm"
                disabled={!selectedId}
              />
            </span>
          </Flyout>
        </div>
      </div>

      <div
        ref={drag.containerRef}
        data-tree-scroll
        className={styles.rows}
        onClick={() => setFolderMenu(null)}
        {...drag.containerProps}
      >
        {visible.length === 0 ? (
          <div className={styles.empty}>{t('rules.empty')}</div>
        ) : (
          visible.map((node) => (
            <RuleTreeNode key={node.id} node={node} depth={0} drag={drag} />
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
