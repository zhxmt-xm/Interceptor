import { isFolder, type RuleNode } from '@interceptor/core-protocol';

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
}

/** 规则树的一个节点：目录渲染成可折叠分组，规则渲染成单行。 */
export function RuleTreeNode({
  node,
  depth,
  drag,
}: RuleTreeNodeProps): React.JSX.Element {
  const expanded = useRulesStore((state) => state.expandedFolders.includes(node.id));
  const renaming = useRulesStore((state) => state.renamingNodeId === node.id);
  const selectedId = useRulesStore((state) => state.selectedId);
  const hits = useRulesStore((state) => state.hits);
  const select = useRulesStore((state) => state.select);
  const toggleRule = useRulesStore((state) => state.toggleRule);

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
        dragging={drag.draggingId === node.id}
        onSelect={select}
        onToggle={toggleRule}
        dragProps={drag.rowProps(node.id)}
      />
    );
  }

  return (
    <>
      <RuleFolderRow
        folder={node}
        depth={depth}
        expanded={expanded}
        dragging={drag.draggingId === node.id}
        dropTarget={drag.intoFolderId === node.id}
        dragProps={drag.rowProps(node.id)}
      />
      {expanded ? (
        <div className={styles.children}>
          {node.children.map((child) => (
            <RuleTreeNode key={child.id} node={child} depth={depth + 1} drag={drag} />
          ))}
        </div>
      ) : null}
    </>
  );
}
