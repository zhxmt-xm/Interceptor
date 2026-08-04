import { randomUUID } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import type {
  DiagnosticLevel,
  DiagnosticLogRecord,
  DiagnosticOutcome,
  DiagnosticProcess,
} from '@interceptor/core-protocol';

import { DIAGNOSTICS_EXPORT_PAGE_SIZE } from '../constants';
import { WorkerHost } from './host/entry';
import type { DiagnosticsPage, DiagnosticsQuery } from './interfaces';
import { redactRecordForExport } from './utils';

/** Diagnostics JSONL 导出的可选过滤与进度类型。 */
export interface DiagnosticsExportFilter {
  readonly process?: DiagnosticProcess;
  readonly level?: DiagnosticLevel;
  readonly outcome?: DiagnosticOutcome;
}

/** Diagnostics 模块门面：组合 Worker host，提供非阻塞写入、分页查询与生命周期。 */
export class DiagnosticsService {
  /** 独占 Diagnostics Worker 线程与请求关联的 host。 */
  private readonly workerHost = new WorkerHost();

  /** 启动 Diagnostics Worker；重复调用复用同一启动 Promise。 */
  start(): Promise<void> {
    return this.workerHost.start();
  }

  /** 非阻塞投递一批已脱敏日志。 */
  sink(records: readonly DiagnosticLogRecord[]): void {
    this.workerHost.sink(records);
  }

  /** 分页查询持久化诊断记录。 */
  query(query: DiagnosticsQuery): Promise<DiagnosticsPage> {
    return this.workerHost.query(query);
  }

  /**
   * 把已脱敏的诊断记录按 JSON Lines 原子导出到文件（可选 level/outcome 过滤）。
   * 记录在写入时已脱敏（不含 Body/Authorization/Cookie/Token/CA 私钥），因此导出天然脱敏。
   * 调用方：CoreApplication 处理 diagnostics.export.start，经共享 TransferService 执行。
   */
  async exportJsonl(
    filePath: string,
    filter: DiagnosticsExportFilter,
    abortSignal: AbortSignal,
    onProgress?: (progress: { processed: number; total: number }) => void,
  ): Promise<{ processed: number; total: number; warnings: string[] }> {
    if (!path.isAbsolute(filePath) || path.extname(filePath).toLowerCase() !== '.jsonl') {
      throw new Error('Diagnostics export path must be an absolute .jsonl file.');
    }
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    const output = await open(temporaryPath, 'wx');
    let processed = 0;
    try {
      let cursor: string | undefined;
      do {
        if (abortSignal.aborted) {
          throw abortSignal.reason instanceof Error
            ? abortSignal.reason
            : new DOMException('Diagnostics export cancelled.', 'AbortError');
        }
        const page = await this.workerHost.query({
          limit: DIAGNOSTICS_EXPORT_PAGE_SIZE,
          cursor,
          process: filter.process,
          level: filter.level,
          outcome: filter.outcome,
        });
        for (const record of page.records) {
          await output.write(
            `${JSON.stringify(redactRecordForExport(record))}\n`,
          );
          processed += 1;
        }
        onProgress?.({ processed, total: processed });
        if (!page.hasMore || !page.nextCursor || page.nextCursor === cursor) {
          break;
        }
        cursor = page.nextCursor;
      } while (true);
      await output.sync();
      await output.close();
      // 直接 rename 覆盖，不留旧文件已删、新文件未就位的窗口。
      await rename(temporaryPath, filePath);
    } catch (error) {
      await output.close().catch(() => undefined);
      await rm(temporaryPath, { force: true });
      throw error;
    }
    return { processed, total: processed, warnings: [] };
  }

  /** 关闭 Worker 并拒绝残余查询。 */
  close(): Promise<void> {
    return this.workerHost.close();
  }
}
