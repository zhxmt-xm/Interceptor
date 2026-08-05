import { useCallback, useEffect, useRef, useState } from 'react';

import {
  findNode,
  fitsDepth,
  folderDepth,
  isFolder,
  type TreeInsertPosition,
  type TreeLeaf,
  type TreeNode,
} from '@interceptor/core-protocol';

/**
 * 目录树的拖拽排序，VS Code 资源管理器的做法：整行 `draggable`，click 与 drag 的区分
 * 完全交给浏览器（drag 一旦开始就不再派发 click），因此不需要自建阈值。
 *
 * 落点判定按行高四等分：目录行的中间一半是「移入该目录」，其余是「排到它前/后」；
 * 「排在 N 之后」一律规范化为「排在 N+1 之前」，这样相邻两行共用一条插入线，鼠标在
 * 交界处来回移动时不会闪。插入线绝对定位且按落点层级缩进，既不挤动行、又能读出落到哪一层。
 */

/** 悬停在收起的目录上多久后自动展开。 */
const AUTO_EXPAND_MS = 500;

/** 插入线的位置，相对滚动容器的内容坐标。 */
export interface TreeDropLine {
  top: number;
  left: number;
  width: number;
}

export interface UseTreeDragOptions<TLeaf extends TreeLeaf> {
  nodes: readonly TreeNode<TLeaf>[];
  /** 搜索等不完整视图中禁用拖拽，避免按局部列表重排完整树。 */
  disabled?: boolean;
  /** 落点确定后执行移动；实现方负责越界时保持原样。 */
  onMove: (nodeId: string, position: TreeInsertPosition) => void;
  /** 悬停展开收起的目录，让规则能一步拖进去。 */
  onAutoExpand: (folderId: string) => void;
}

export interface TreeDragApi {
  /** 挂在滚动容器上；插入线以它为定位参照。 */
  containerRef: React.RefObject<HTMLDivElement | null>;
  containerProps: {
    onDragOver: (event: React.DragEvent<HTMLElement>) => void;
    onDrop: (event: React.DragEvent<HTMLElement>) => void;
    onDragLeave: (event: React.DragEvent<HTMLElement>) => void;
  };
  /** 挂在每一行上；行还需带 `data-tree-row={id}` 供落点命中。 */
  rowProps: (nodeId: string) => {
    draggable: boolean;
    onDragStart: (event: React.DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
  };
  /** 正在被拖的节点，用于把源行画淡。 */
  draggingId: string | null;
  /** 当前「移入」高亮的目录。 */
  intoFolderId: string | null;
  dropLine: TreeDropLine | null;
}

export function useTreeDrag<TLeaf extends TreeLeaf>({
  nodes,
  disabled = false,
  onMove,
  onAutoExpand,
}: UseTreeDragOptions<TLeaf>): TreeDragApi {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [intoFolderId, setIntoFolderId] = useState<string | null>(null);
  const [dropLine, setDropLine] = useState<TreeDropLine | null>(null);
  const dropPosition = useRef<TreeInsertPosition | null>(null);
  const autoExpand = useRef<{ folderId: string; timer: number } | null>(null);

  const cancelAutoExpand = useCallback((): void => {
    if (autoExpand.current) {
      window.clearTimeout(autoExpand.current.timer);
      autoExpand.current = null;
    }
  }, []);

  const clearFeedback = useCallback((): void => {
    dropPosition.current = null;
    setIntoFolderId(null);
    setDropLine(null);
  }, []);

  useEffect(() => cancelAutoExpand, [cancelAutoExpand]);

  const scheduleAutoExpand = useCallback(
    (folderId: string): void => {
      if (autoExpand.current?.folderId === folderId) {
        return;
      }
      cancelAutoExpand();
      autoExpand.current = {
        folderId,
        timer: window.setTimeout(() => {
          onAutoExpand(folderId);
          autoExpand.current = null;
        }, AUTO_EXPAND_MS),
      };
    },
    [cancelAutoExpand, onAutoExpand],
  );

  const onDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>): void => {
      if (disabled) {
        return;
      }
      const container = containerRef.current;
      const dragged = draggingId ? findNode(nodes, draggingId) : null;
      if (!container || !dragged) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      clearFeedback();

      const hit = rowAt(container, event.clientY);
      // 最后一行之下是列表的空尾巴，也就是根级末尾。
      if (!hit) {
        cancelAutoExpand();
        const last = lastRow(container);
        if (last && fitsDepth(0, dragged)) {
          dropPosition.current = { parentId: null, beforeId: null };
          setDropLine(lineFor(container, last, true));
        }
        return;
      }

      const targetId = hit.row.dataset.treeRow ?? '';
      const target = findNode(nodes, targetId);
      // 不能落到自己身上，也不能落进自己的子树。
      if (!target || targetId === draggingId || findNode([dragged], targetId)) {
        cancelAutoExpand();
        return;
      }

      const sector = clampSector((event.clientY - hit.rect.top) / hit.rect.height);
      if (isFolder(target) && sector > 0 && sector < 3) {
        if (!fitsDepth(folderDepth(nodes, targetId), dragged)) {
          cancelAutoExpand();
          return;
        }
        dropPosition.current = { parentId: targetId, beforeId: null };
        setIntoFolderId(targetId);
        scheduleAutoExpand(targetId);
        return;
      }

      cancelAutoExpand();
      const parentId = parentFolderId(nodes, targetId);
      if (!fitsDepth(folderDepth(nodes, parentId), dragged)) {
        return;
      }
      const after = sector >= 2;
      dropPosition.current = {
        parentId,
        beforeId: after ? siblingAfter(nodes, targetId) : targetId,
      };
      setDropLine(lineFor(container, hit.row, after));
    },
    [cancelAutoExpand, clearFeedback, disabled, draggingId, nodes, scheduleAutoExpand],
  );

  const finishDrag = useCallback((): void => {
    cancelAutoExpand();
    clearFeedback();
    setDraggingId(null);
  }, [cancelAutoExpand, clearFeedback]);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLElement>): void => {
      const position = dropPosition.current;
      if (draggingId && position) {
        event.preventDefault();
        onMove(draggingId, position);
      }
      finishDrag();
    },
    [draggingId, finishDrag, onMove],
  );

  const onDragLeave = useCallback(
    (event: React.DragEvent<HTMLElement>): void => {
      if (!containerRef.current?.contains(event.relatedTarget as Node | null)) {
        cancelAutoExpand();
        clearFeedback();
      }
    },
    [cancelAutoExpand, clearFeedback],
  );

  const rowProps = useCallback(
    (nodeId: string) => ({
      draggable: !disabled,
      onDragStart: (event: React.DragEvent<HTMLElement>): void => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', nodeId);
        setDraggingId(nodeId);
      },
      onDragEnd: finishDrag,
    }),
    [disabled, finishDrag],
  );

  return {
    containerRef,
    containerProps: { onDragOver, onDrop, onDragLeave },
    rowProps,
    draggingId,
    intoFolderId,
    dropLine,
  };
}

/** 行与行之间的间隙也属于某一行，因此按指针 Y 找而不是按事件目标找。 */
function rowAt(
  container: HTMLElement,
  clientY: number,
): { row: HTMLElement; rect: DOMRect } | null {
  for (const row of container.querySelectorAll<HTMLElement>('[data-tree-row]')) {
    const rect = row.getBoundingClientRect();
    if (clientY < rect.bottom) {
      return { row, rect };
    }
  }
  return null;
}

/** 列表里最后一个可见行，供根级末尾的插入线定位。 */
function lastRow(container: HTMLElement): HTMLElement | null {
  const rows = container.querySelectorAll<HTMLElement>('[data-tree-row]');
  return rows.item(rows.length - 1);
}

/** 插入线从目标行的内容起点画起，缩进即落点层级。 */
function lineFor(
  container: HTMLElement,
  row: HTMLElement,
  after: boolean,
): TreeDropLine {
  const containerRect = container.getBoundingClientRect();
  const rect = row.getBoundingClientRect();
  const indent = Number.parseFloat(getComputedStyle(row).paddingLeft);
  return {
    top: (after ? rect.bottom : rect.top) - containerRect.top + container.scrollTop - 1,
    left: rect.left - containerRect.left + indent,
    width: rect.width - indent,
  };
}

const clampSector = (ratio: number): number =>
  Math.min(3, Math.max(0, Math.floor(ratio / 0.25)));

/** 某节点所在的父目录 id；顶层为 null。 */
function parentFolderId<TLeaf extends TreeLeaf>(
  nodes: readonly TreeNode<TLeaf>[],
  nodeId: string,
): string | null {
  for (const node of nodes) {
    if (!isFolder(node)) {
      continue;
    }
    if (node.children.some((child) => child.id === nodeId)) {
      return node.id;
    }
    const found = parentFolderId(node.children, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

/** 同级里排在该节点之后的那个节点 id；已是最后一个时为 null。 */
function siblingAfter<TLeaf extends TreeLeaf>(
  nodes: readonly TreeNode<TLeaf>[],
  nodeId: string,
): string | null {
  const parentId = parentFolderId(nodes, nodeId);
  const parent = parentId ? findNode(nodes, parentId) : null;
  const siblings = parent && isFolder(parent) ? parent.children : nodes;
  const index = siblings.findIndex((node) => node.id === nodeId);
  return siblings[index + 1]?.id ?? null;
}
