import path from 'node:path';

import type { TransferJobSnapshot } from '@interceptor/core-protocol';

import type {
  MutableTransferJob,
  TransferOperation,
} from './interfaces';

/**
 * HAR 与原生 archive 共用的异步文件任务管理器。
 *
 * 保存全部运行中与完成任务，按 jobId 关联进度、终态和取消，且公开快照绝不
 * 泄漏绝对路径或 AbortController。HarService 与 ArchiveService 注入同一个实例，
 * 因此整个 Core 只存在一套任务基础设施，`transfer.job.get/cancel` 直接查询它。
 */
export class TransferJobManager {
  /** 保存当前 Core 代际创建的全部任务。 */
  private readonly jobs = new Map<string, MutableTransferJob>();

  /**
   * 校验 ID 唯一性并异步启动一个可取消、可汇报进度的文件任务。
   * 调用方：HarService/ArchiveService 的 startExport/startImport。
   */
  start(
    jobId: string,
    kind: TransferJobSnapshot['kind'],
    filePath: string,
    operation: TransferOperation,
  ): TransferJobSnapshot {
    const job = this.create(jobId, kind, filePath);
    void this.run(job, operation);
    return TransferJobManager.toSnapshot(job);
  }

  /** 返回指定任务的不可变公开快照；未知 ID 返回 null。 */
  get(jobId: string): TransferJobSnapshot | null {
    const job = this.jobs.get(jobId);
    return job ? TransferJobManager.toSnapshot(job) : null;
  }

  /** 取消运行中任务并立即更新公开状态；终态任务保持幂等。 */
  cancel(jobId: string): TransferJobSnapshot | null {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }
    if (job.state === 'running') {
      job.state = 'cancelled';
      job.completedAt = new Date().toISOString();
      job.message = 'Transfer cancelled.';
      job.controller.abort(new DOMException('Transfer cancelled.', 'AbortError'));
    }
    return TransferJobManager.toSnapshot(job);
  }

  /** 取消所有运行中任务；CoreApplication 关闭时用于终止文件 I/O。 */
  cancelAll(): void {
    for (const jobId of this.jobs.keys()) {
      this.cancel(jobId);
    }
  }

  /** 校验 ID 唯一性并建立初始 running 状态。 */
  private create(
    jobId: string,
    kind: TransferJobSnapshot['kind'],
    filePath: string,
  ): MutableTransferJob {
    if (this.jobs.has(jobId)) {
      throw new Error('Transfer job ID is already active.');
    }
    const job: MutableTransferJob = {
      id: jobId,
      kind,
      fileName: path.basename(filePath),
      state: 'running',
      processed: 0,
      total: 0,
      startedAt: new Date().toISOString(),
      warnings: [],
      controller: new AbortController(),
    };
    this.jobs.set(jobId, job);
    return job;
  }

  /** 执行转换并把进度、完成、失败或取消归并到同一任务对象。 */
  private async run(
    job: MutableTransferJob,
    operation: TransferOperation,
  ): Promise<void> {
    try {
      const result = await operation(job.controller.signal, (progress) => {
        if (job.state === 'running') {
          job.processed = progress.processed;
          job.total = progress.total;
        }
      });
      if (job.state !== 'running') {
        return;
      }
      job.state = 'completed';
      job.processed = result.processed;
      job.total = result.total;
      job.warnings = [...result.warnings];
      job.completedAt = new Date().toISOString();
    } catch (error) {
      if (job.state === 'cancelled' || job.controller.signal.aborted) {
        job.state = 'cancelled';
        job.message = 'Transfer cancelled.';
      } else {
        job.state = 'failed';
        job.message = TransferJobManager.publicErrorMessage(error);
      }
      job.completedAt ??= new Date().toISOString();
    }
  }

  /** 复制可公开字段，确保绝对路径和 AbortController 不进入 wire。 */
  private static toSnapshot(job: MutableTransferJob): TransferJobSnapshot {
    return {
      id: job.id,
      kind: job.kind,
      state: job.state,
      fileName: job.fileName,
      processed: job.processed,
      total: job.total,
      startedAt: job.startedAt,
      ...(job.completedAt ? { completedAt: job.completedAt } : {}),
      ...(job.message ? { message: job.message } : {}),
      warnings: [...job.warnings],
    };
  }

  /** 将内部异常映射为不泄漏绝对路径的用户可见消息。 */
  private static publicErrorMessage(error: unknown): string {
    if (
      error instanceof Error &&
      (error.name === 'InvalidHarError' || error.name === 'ArchiveInvalidError')
    ) {
      return error.message;
    }
    if (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string'
    ) {
      return `File operation failed (${error.code}).`;
    }
    return 'File transfer failed.';
  }
}
