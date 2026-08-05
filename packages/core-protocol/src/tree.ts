/**
 * 命名目录树的共享形状与纯操作。
 *
 * Rules 的规则树与 Composer 的请求集合是同一种结构——可嵌套的命名目录 + 各自的叶子，
 * 因此目录节点、深度上限与增删改移只在这里定义一次，两个 feature 只提供自己的叶子类型。
 * 全部是纯函数：返回新数组，不改动入参。
 */

/** 目录树最多嵌套的层数；再深下去列表宽度就不足以显示叶子内容。 */
export const MAX_FOLDER_DEPTH = 3;

/** 叶子节点的最小约定：可被树操作识别、定位与命名。`kind` 不得为 `'folder'`。 */
export interface TreeLeaf {
  readonly kind: string;
  readonly id: string;
  readonly name: string;
}

/** 命名目录，可继续嵌套目录或叶子。 */
export interface TreeFolder<TLeaf extends TreeLeaf> {
  readonly kind: 'folder';
  readonly id: string;
  readonly name: string;
  readonly children: readonly TreeNode<TLeaf>[];
}

export type TreeNode<TLeaf extends TreeLeaf> = TreeFolder<TLeaf> | TLeaf;

/** 插入位置：落进 `parentId` 目录（null 为根），排在 `beforeId` 之前（null 为末尾）。 */
export interface TreeInsertPosition {
  readonly parentId: string | null;
  readonly beforeId: string | null;
}

/** 目录判定。泛型叶子无法靠字面量收窄，因此收窄一律走这两个守卫。 */
export function isFolder<TLeaf extends TreeLeaf>(
  node: TreeNode<TLeaf>,
): node is TreeFolder<TLeaf> {
  return node.kind === 'folder';
}

/** 叶子判定。 */
export function isLeaf<TLeaf extends TreeLeaf>(
  node: TreeNode<TLeaf>,
): node is TLeaf {
  return node.kind !== 'folder';
}

/** 深度优先查找任意节点。 */
export function findNode<TLeaf extends TreeLeaf>(
  nodes: readonly TreeNode<TLeaf>[],
  nodeId: string,
): TreeNode<TLeaf> | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    if (isFolder(node)) {
      const found = findNode(node.children, nodeId);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/** 深度优先查找一个叶子。 */
export function findLeaf<TLeaf extends TreeLeaf>(
  nodes: readonly TreeNode<TLeaf>[],
  leafId: string,
): TLeaf | null {
  const node = findNode(nodes, leafId);
  return node && isLeaf(node) ? node : null;
}

/** 就地替换一个叶子；未找到时原样返回。 */
export function replaceLeaf<TLeaf extends TreeLeaf>(
  nodes: readonly TreeNode<TLeaf>[],
  leaf: TLeaf,
): TreeNode<TLeaf>[] {
  return nodes.map((node) =>
    isFolder(node)
      ? { ...node, children: replaceLeaf(node.children, leaf) }
      : node.id === leaf.id
        ? leaf
        : node,
  );
}

/** 按 ID 删除任意节点（目录连同其子树）。 */
export function removeNode<TLeaf extends TreeLeaf>(
  nodes: readonly TreeNode<TLeaf>[],
  nodeId: string,
): TreeNode<TLeaf>[] {
  const kept: TreeNode<TLeaf>[] = [];
  for (const node of nodes) {
    if (node.id === nodeId) {
      continue;
    }
    kept.push(
      isFolder(node)
        ? { ...node, children: removeNode(node.children, nodeId) }
        : node,
    );
  }
  return kept;
}

/** 重命名任意节点。 */
export function renameNode<TLeaf extends TreeLeaf>(
  nodes: readonly TreeNode<TLeaf>[],
  nodeId: string,
  name: string,
): TreeNode<TLeaf>[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return { ...node, name };
    }
    return isFolder(node)
      ? { ...node, children: renameNode(node.children, nodeId, name) }
      : node;
  });
}

/** 把新节点追加到指定目录末尾；folderId 为 null 时追加到根。 */
export function appendNode<TLeaf extends TreeLeaf>(
  nodes: readonly TreeNode<TLeaf>[],
  folderId: string | null,
  child: TreeNode<TLeaf>,
): TreeNode<TLeaf>[] {
  return insertNode(nodes, child, { parentId: folderId, beforeId: null });
}

/** 把节点插入到指定位置；调用方负责先 `removeNode` 掉原位置（移动即删+插）。 */
export function insertNode<TLeaf extends TreeLeaf>(
  nodes: readonly TreeNode<TLeaf>[],
  node: TreeNode<TLeaf>,
  position: TreeInsertPosition,
): TreeNode<TLeaf>[] {
  if (position.parentId === null) {
    return spliceBefore(nodes, node, position.beforeId);
  }
  return nodes.map((current) => {
    if (!isFolder(current)) {
      return current;
    }
    if (current.id === position.parentId) {
      return {
        ...current,
        children: spliceBefore(current.children, node, position.beforeId),
      };
    }
    return { ...current, children: insertNode(current.children, node, position) };
  });
}

/** 在 beforeId 之前插入；beforeId 为 null 或不存在时追加到末尾。 */
function spliceBefore<TLeaf extends TreeLeaf>(
  nodes: readonly TreeNode<TLeaf>[],
  node: TreeNode<TLeaf>,
  beforeId: string | null,
): TreeNode<TLeaf>[] {
  const index = beforeId === null
    ? -1
    : nodes.findIndex((current) => current.id === beforeId);
  if (index < 0) {
    return [...nodes, node];
  }
  return [...nodes.slice(0, index), node, ...nodes.slice(index)];
}

/** 按深度优先顺序收集全部叶子；对 Rules 而言这个顺序就是执行顺序。 */
export function collectLeaves<TLeaf extends TreeLeaf>(
  nodes: readonly TreeNode<TLeaf>[],
): TLeaf[] {
  return nodes.flatMap((node) =>
    isFolder(node) ? collectLeaves(node.children) : [node],
  );
}

/** 按深度优先顺序收集全部叶子 ID。 */
export function collectLeafIds<TLeaf extends TreeLeaf>(
  nodes: readonly TreeNode<TLeaf>[],
): string[] {
  return collectLeaves(nodes).map((leaf) => leaf.id);
}

/** 统计一棵（子）树里的叶子数量，供目录行计数使用。 */
export function countLeaves<TLeaf extends TreeLeaf>(
  nodes: readonly TreeNode<TLeaf>[],
): number {
  return collectLeaves(nodes).length;
}

/** 目录自身的层级（顶层目录为 1）；节点不存在或不是目录时返回 0。 */
export function folderDepth<TLeaf extends TreeLeaf>(
  nodes: readonly TreeNode<TLeaf>[],
  folderId: string | null,
  depth = 0,
): number {
  if (folderId === null) {
    return depth;
  }
  for (const node of nodes) {
    if (!isFolder(node)) {
      continue;
    }
    if (node.id === folderId) {
      return depth + 1;
    }
    const found = folderDepth(node.children, folderId, depth + 1);
    if (found > 0) {
      return found;
    }
  }
  return 0;
}

/** 节点所在目录的 id；顶层节点或找不到时都返回 null——两种情况的落点都是根。 */
export function parentFolderId<TLeaf extends TreeLeaf>(
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
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/** 一个节点自身的目录高度：叶子为 0，只含叶子的目录为 1，每多一层子目录 +1。 */export function subtreeHeight<TLeaf extends TreeLeaf>(
  node: TreeNode<TLeaf>,
): number {
  if (!isFolder(node)) {
    return 0;
  }
  return (
    1 +
    node.children.reduce(
      (deepest, child) => Math.max(deepest, subtreeHeight(child)),
      0,
    )
  );
}

/** 目标目录能否容纳该节点而不超过 {@link MAX_FOLDER_DEPTH}。 */
export function fitsDepth<TLeaf extends TreeLeaf>(
  parentDepth: number,
  node: TreeNode<TLeaf>,
): boolean {
  return parentDepth + subtreeHeight(node) <= MAX_FOLDER_DEPTH;
}
