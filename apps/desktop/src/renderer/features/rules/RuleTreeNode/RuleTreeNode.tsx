import { isFolder, type RuleNode } from '@interceptor/core-protocol';

import type { TreeSearchResult } from '../../../components';
import type { TreeDragApi } from '../../../components/share/useTreeDrag';
import { useRulesStore } from '../data/rulesStore';
import { RuleFolderRow } from '../RuleFolderRow/RuleFolderRow';
import { RuleRenameRow } from '../RuleRenameRow/RuleRenameRow';
import { RuleRow } from '../RuleRow/RuleRow';

import styles from './RuleTreeNode.module.css';

export interface RuleTreeNodeProps {
  node: RuleNode;
  depth: number;
  drag: TreeDragApi;
  search: TreeSearchResult;
  onShowRuleRequests: (ruleId: string) => void;
}

/** 规则树的一个节点：目录渲染成可折叠分组，规则渲染成单行。 */
export function RuleTreeNode({
  node,
  depth,
  drag,
  search,
  onShowRuleRequests,
}: RuleTreeNodeProps): React.JSX.Element | null {
  const storedExpanded = useRulesStore((state) => state.expandedFolders.includes(node.id));
  const renaming = useRulesStore((state) => state.renamingNodeId === node.id);
  const selectedId = useRulesStore((state) => state.selectedId);
  const openRuleId = useRulesStore((state) => state.openRuleId);
  const hits = useRulesStore((state) => state.hits);
  const select = useRulesStore((state) => state.select);
  const toggleRule = useRulesStore((state) => state.toggleRule);

  if (search.visible !== null && !search.visible.has(node.id)) {
    return null;
  }
  // 搜索期间强制展开，否则命中的行藏在折叠目录里等于没搜到
  const expanded = search.visible !== null || storedExpanded;
  const keyword = search.matched.has(node.id) ? search.keyword : '';

  if (renaming) {
    return <RuleRenameRow nodeId={node.id} name={node.name} depth={depth} />;
  }

  if (!isFolder(node)) {
    return (
      <RuleRow
        rule={node}
        depth={depth}
        hits={hits[node.id] ?? 0}
        selected={node.id === selectedId}
        open={node.id === openRuleId}
        dragging={drag.draggingId === node.id}
        keyword={keyword}
        onSelect={select}
        onToggle={toggleRule}
        onShowRuleRequests={onShowRuleRequests}
        dragProps={drag.rowProps(node.id)}
      />
    );
  }

  return (
    <section className={styles.group}>
      <RuleFolderRow
        folder={node}
        depth={depth}
        expanded={expanded}
        selected={node.id === selectedId}
        dragging={drag.draggingId === node.id}
        dropTarget={drag.intoFolderId === node.id}
        keyword={keyword}
        dragProps={drag.rowProps(node.id)}
      />
      {expanded ? (
        <div className={styles.children}>
          {node.children.map((child) => (
            <RuleTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              drag={drag}
              search={search}
              onShowRuleRequests={onShowRuleRequests}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
