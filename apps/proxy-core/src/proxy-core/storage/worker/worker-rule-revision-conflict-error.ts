/** 规则集 expectedRevision 与当前 revision 冲突。 */
export class RuleRevisionConflictError extends Error {
  /** 调用方提交的 revision。 */
  readonly expectedRevision: number;
  /** Storage 当前 revision。 */
  readonly actualRevision: number;

  /** 记录双方 revision 并构造稳定冲突错误。 */
  constructor(expectedRevision: number, actualRevision: number) {
    super(
      `Rule set revision conflict: expected ${expectedRevision}, found ${actualRevision}.`,
    );
    this.name = 'RuleRevisionConflictError';
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}