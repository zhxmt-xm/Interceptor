/**
 * 工作区里持久化的低频配置文档。
 * 每张表结构完全相同（单行 + revision + JSON 载荷），只有表名与载荷类型不同。
 */
export type WorkspaceDocument =
  | 'rule_set'
  | 'collection_tree'
  | 'tls_passthrough_hosts'
  | 'tls_insecure_hosts'
  | 'tls_decryption_preference'
  | 'upstream_proxy_settings';

/** 单行文档表读出的 revision 与 JSON 载荷。 */
export interface WorkspaceDocumentRow {
  revision: number;
  json: string;
}
