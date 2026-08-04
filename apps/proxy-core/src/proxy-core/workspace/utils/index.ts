import type { WorkspaceDocument } from '../interfaces';

/** 表名来自内部联合类型常量而非外部输入；SQLite 不支持表名占位符，只能拼接。 */
export function createDocumentTable(document: WorkspaceDocument): string {
  return `
    CREATE TABLE IF NOT EXISTS ${document} (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      revision INTEGER NOT NULL,
      document_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `;
}

/** 读取单行文档的 SQL。 */
export function selectDocument(document: WorkspaceDocument): string {
  return `SELECT revision AS revision, document_json AS json FROM ${document} WHERE id = 1`;
}

/** 写入或替换单行文档的 SQL。 */
export function upsertDocument(document: WorkspaceDocument): string {
  return `
    INSERT INTO ${document} (id, revision, document_json, updated_at)
    VALUES (1, :revision, :json, :updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      revision = :revision, document_json = :json, updated_at = :updatedAt
  `;
}
