import type { DiagnosticLogRecord } from '@interceptor/core-protocol';

import { DiagnosticsWorkerHost } from './host/entry';
import type { DiagnosticsPage, DiagnosticsQuery } from './interfaces';

/** Diagnostics 模块门面：组合 Worker host，提供非阻塞写入、分页查询与生命周期。 */
export class DiagnosticsService {
  /** 独占 Diagnostics Worker 线程与请求关联的 host。 */
  private readonly host = new DiagnosticsWorkerHost();

  /** 启动 Diagnostics Worker；重复调用复用同一启动 Promise。 */
  start(): Promise<void> {
    return this.host.start();
  }

  /** 非阻塞投递一批已脱敏日志。 */
  sink(records: readonly DiagnosticLogRecord[]): void {
    this.host.sink(records);
  }

  /** 分页查询持久化诊断记录。 */
  query(query: DiagnosticsQuery): Promise<DiagnosticsPage> {
    return this.host.query(query);
  }

  /** 关闭 Worker 并拒绝残余查询。 */
  close(): Promise<void> {
    return this.host.close();
  }
}
