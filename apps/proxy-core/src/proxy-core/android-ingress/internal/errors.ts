/** 协议校验失败只暴露固定错误，不把正文、headers或凭据写入日志。 */
export class InspectionProtocolError extends Error {
  /** 构造可由入口记录并转为取消的固定错误。 */
  constructor() {
    super('Invalid inspection protocol message');
    this.name = 'InspectionProtocolError';
  }
}
