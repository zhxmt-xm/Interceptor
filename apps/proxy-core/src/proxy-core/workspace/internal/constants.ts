import type { WorkspaceDocument } from '../interfaces';

/** 建表时遍历的全部文档表；新增一种配置只需在此追加表名。 */
export const WORKSPACE_DOCUMENTS: readonly WorkspaceDocument[] = [
  'rule_set',
  'collection_tree',
];
