/** 工作区文档的 expectedRevision 与当前 revision 冲突。 */
export class RevisionConflictError extends Error {
  /** 发生冲突的文档表名。 */
  readonly document: string;
  /** 调用方提交的 revision。 */
  readonly expectedRevision: number;
  /** WorkspaceService 当前 revision。 */
  readonly actualRevision: number;

  /** 记录文档与双方 revision 并构造稳定冲突错误。 */
  constructor(
    document: string,
    expectedRevision: number,
    actualRevision: number,
  ) {
    super(
      `Revision conflict on ${document}: expected ${expectedRevision}, found ${actualRevision}.`,
    );
    this.name = 'RevisionConflictError';
    this.document = document;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}
