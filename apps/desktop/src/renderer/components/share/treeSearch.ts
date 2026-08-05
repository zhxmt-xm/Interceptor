import { isFolder, type TreeLeaf, type TreeNode } from '@interceptor/core-protocol';

/** 一次搜索的结果：哪些节点该渲染、哪些节点的名字该高亮。 */
export interface TreeSearchResult {
  /** 应该渲染的节点 id；未搜索时为 null，表示全部渲染。 */
  readonly visible: ReadonlySet<string> | null;
  /** 名字命中关键词的节点 id，用于高亮。 */
  readonly matched: ReadonlySet<string>;
  /** 规范化后的关键词，空串表示未搜索。 */
  readonly keyword: string;
  /** 搜索态且一个都没命中。 */
  readonly empty: boolean;
}

const IDLE: TreeSearchResult = {
  visible: null,
  matched: new Set(),
  keyword: '',
  empty: false,
};

/**
 * 只按名称匹配，忽略大小写与首尾空格。目录命中则整棵子树保留，
 * 目录未命中但子孙有命中时目录作为路径保留。规则见 architecture/platform/renderer.md §6.2。
 */
export function searchTree<TLeaf extends TreeLeaf>(
  nodes: readonly TreeNode<TLeaf>[],
  rawKeyword: string,
): TreeSearchResult {
  const keyword = rawKeyword.trim().toLowerCase();
  if (!keyword) {
    return IDLE;
  }

  const visible = new Set<string>();
  const matched = new Set<string>();

  const collectAll = (branch: readonly TreeNode<TLeaf>[]): void => {
    for (const node of branch) {
      visible.add(node.id);
      if (isFolder(node)) {
        collectAll(node.children);
      }
    }
  };

  // 返回该分支下是否有可见节点，父目录据此决定自己要不要作为路径保留
  const walk = (branch: readonly TreeNode<TLeaf>[]): boolean => {
    let anyVisible = false;
    for (const node of branch) {
      const selfHit = node.name.toLowerCase().includes(keyword);
      if (selfHit) {
        matched.add(node.id);
      }
      if (!isFolder(node)) {
        if (selfHit) {
          visible.add(node.id);
          anyVisible = true;
        }
        continue;
      }
      if (selfHit) {
        visible.add(node.id);
        collectAll(node.children);
        anyVisible = true;
        continue;
      }
      if (walk(node.children)) {
        visible.add(node.id);
        anyVisible = true;
      }
    }
    return anyVisible;
  };

  walk(nodes);
  return { visible, matched, keyword, empty: visible.size === 0 };
}
