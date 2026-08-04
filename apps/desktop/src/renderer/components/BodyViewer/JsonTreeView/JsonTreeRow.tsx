import { ChevronDown, ChevronRight } from 'lucide-react';

import { cx } from '../../share/cx';
import { type JsonNode, isContainer } from './jsonTree';
import styles from './JsonTreeRow.module.css';

interface JsonTreeRowProps {
  node: JsonNode;
  expanded: boolean;
  selected: boolean;
  onToggle(path: string): void;
  onContextMenu(event: React.MouseEvent, node: JsonNode): void;
}

const OPEN_BRACKET: Record<string, string> = { object: '{', array: '[' };
const CLOSE_BRACKET: Record<string, string> = { object: '}', array: ']' };

/** 一行树节点；缩进由 padding-left 提供，chevron 悬挂在缩进槽里不额外占列。 */
export function JsonTreeRow({
  node,
  expanded,
  selected,
  onToggle,
  onContextMenu,
}: JsonTreeRowProps): React.JSX.Element {
  const container = isContainer(node.kind);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <div
      className={cx(styles.row, selected && styles.selected)}
      style={{ paddingLeft: `${4 + node.depth * 15}px` }}
      onContextMenu={(event) => onContextMenu(event, node)}
    >
      {node.closing ? (
        <span className={styles.punctuation}>{CLOSE_BRACKET[node.kind]}</span>
      ) : (
        <>
          {container ? (
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={expanded}
              onClick={() => onToggle(node.path)}
            >
              <Chevron aria-hidden="true" />
            </button>
          ) : null}
          {node.label === null ? null : (
            <>
              <span className={node.isIndex ? styles.index : styles.key}>{node.label}</span>
              <span className={styles.punctuation}>:</span>
            </>
          )}
          {container ? renderContainer() : renderLeaf()}
        </>
      )}
    </div>
  );

  function renderContainer(): React.JSX.Element {
    const count = node.kind === 'array'
      ? `${node.childCount} items`
      : `${node.childCount} keys`;
    return expanded ? (
      <>
        <span className={styles.punctuation}>{OPEN_BRACKET[node.kind]}</span>
        <span className={styles.summary}>{count}</span>
      </>
    ) : (
      <>
        <span className={styles.summary}>
          {OPEN_BRACKET[node.kind]}…{CLOSE_BRACKET[node.kind]}
        </span>
        <span className={styles.summary}>{count}</span>
      </>
    );
  }

  function renderLeaf(): React.JSX.Element {
    if (node.kind === 'string') {
      return <span className={styles.string}>{JSON.stringify(node.value)}</span>;
    }
    if (node.kind === 'null') {
      return <span className={styles.null}>null</span>;
    }
    return <span className={styles.number}>{String(node.value)}</span>;
  }
}
