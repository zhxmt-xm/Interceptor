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

/** 被跳过的导入节点：`path` 是用户在文件里能对应上的位置，`reason` 交给 Renderer 翻译。 */
export interface TreeImportSkip {
  readonly path: string;
  readonly reason: string;
}

/** 领域层对单个叶子的校验结果；失败原因由各 feature 自己定义。 */
export type TreeLeafParseResult<TLeaf extends TreeLeaf> =
  | { readonly ok: true; readonly leaf: TLeaf }
  | { readonly ok: false; readonly reason: string };

/** 导入分析结果。文件级失败只有 `ok: false`，因为此时一个节点都定位不到。 */
export type TreeImportResult<TLeaf extends TreeLeaf> =
  | {
      readonly ok: true;
      readonly nodes: readonly TreeNode<TLeaf>[];
      readonly folderCount: number;
      readonly leafCount: number;
      readonly enabledCount: number;
      readonly skipped: readonly TreeImportSkip[];
    }
  | { readonly ok: false; readonly reason: string };

/** 名称缺失时退化为位置标签，否则用户无法把失败项对应回文件。 */
function importLabel(name: unknown, index: number): string {
  return typeof name === 'string' && name.length > 0 ? name : `#${index + 1}`;
}

function joinImportPath(parentPath: string, label: string): string {
  return parentPath ? `${parentPath} / ${label}` : label;
}

/**
 * 解析导入文件里的目录树：结构遍历在此统一处理，字段校验交给 `parseLeaf`。
 *
 * 非法节点逐项跳过并记录位置与原因，合法兄弟节点照常导入；目录自身非法或深度超限时
 * 连同子树一起跳过，不把子节点静默提升一层。所有 `id` 重新生成，同一文件可重复导入。
 */
export function parseImportedTree<TLeaf extends TreeLeaf>(
  value: unknown,
  parseLeaf: (raw: Record<string, unknown>) => TreeLeafParseResult<TLeaf>,
  createId: () => string,
): TreeImportResult<TLeaf> {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, reason: 'not-an-object' };
  }
  const rawNodes = (value as { nodes?: unknown }).nodes;
  if (!Array.isArray(rawNodes)) {
    return { ok: false, reason: 'missing-nodes' };
  }

  const skipped: TreeImportSkip[] = [];
  let folderCount = 0;
  let leafCount = 0;
  let enabledCount = 0;

  const walk = (
    entries: readonly unknown[],
    depth: number,
    parentPath: string,
  ): TreeNode<TLeaf>[] => {
    const accepted: TreeNode<TLeaf>[] = [];
    entries.forEach((entry, index) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        skipped.push({ path: joinImportPath(parentPath, `#${index + 1}`), reason: 'not-an-object' });
        return;
      }
      const raw = entry as Record<string, unknown>;
      const label = importLabel(raw.name, index);
      const path = joinImportPath(parentPath, label);

      if (typeof raw.kind !== 'string') {
        skipped.push({ path, reason: 'unknown-kind' });
        return;
      }
      if (typeof raw.name !== 'string' || raw.name.length === 0) {
        skipped.push({ path, reason: 'missing-name' });
        return;
      }
      if (depth >= MAX_FOLDER_DEPTH && raw.kind === 'folder') {
        skipped.push({ path, reason: 'exceeds-depth' });
        return;
      }

      if (raw.kind === 'folder') {
        if (!Array.isArray(raw.children)) {
          skipped.push({ path, reason: 'invalid-children' });
          return;
        }
        const children = walk(raw.children, depth + 1, path);
        folderCount += 1;
        accepted.push({ kind: 'folder', id: createId(), name: raw.name, children });
        return;
      }

      const parsed = parseLeaf(raw);
      if (!parsed.ok) {
        skipped.push({ path, reason: parsed.reason });
        return;
      }
      leafCount += 1;
      if ((parsed.leaf as { enabled?: unknown }).enabled === true) {
        enabledCount += 1;
      }
      accepted.push({ ...parsed.leaf, id: createId() });
    });
    return accepted;
  };

  const nodes = walk(rawNodes, 0, '');
  return { ok: true, nodes, folderCount, leafCount, enabledCount, skipped };
}
