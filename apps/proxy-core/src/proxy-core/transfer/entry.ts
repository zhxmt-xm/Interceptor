import path from 'node:path';

import type { TransferJobSnapshot } from '@interceptor/core-protocol';

import type {
  MutableTransferJob,
  TransferOperation,
} from './interfaces';

/**
 * HAR、原生 archive、诊断与单正文保存共用的异步文件任务管理器。
 *
 * 保存全部运行中与完成任务，按 jobId 关联进度、终态和取消，且公开快照绝不
 * 泄漏绝对路径或 AbortController。HarService 与 ArchiveService 注入同一个实例，
 * 因此整个 Core 只存在一套任务基础设施，`transfer.job.get/cancel` 直接查询它。
 */
export class TransferService {
  /** 保存当前 Core 代际创建的全部任务。 */
  private readonly jobs = new Map<string, MutableTransferJob>();
  /** 尚未结束的任务操作，包含已取消但仍在清理的文件读写。 */
  private readonly pendingTransfersById = new Map<string, Promise<void>>();
  /** 成功任务的业务通知接收者；不传递文件信息。 */
  private completedListener: ((kind: TransferJobSnapshot['kind']) => void) | null = null;

  /** 注册当前Core业务owner，在任务成功提交后接收一次通知。 */
  onCompleted(listener: (kind: TransferJobSnapshot['kind']) => void): void {
    this.completedListener = listener;
  }

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
    const transferring = this.run(job, operation).finally(() => {
      this.pendingTransfersById.delete(jobId);
    });
    this.pendingTransfersById.set(jobId, transferring);
    return TransferService.toSnapshot(job);
  }

  /** 返回指定任务的不可变公开快照；未知 ID 返回 null。 */
  get(jobId: string): TransferJobSnapshot | null {
    const job = this.jobs.get(jobId);
    return job ? TransferService.toSnapshot(job) : null;
  }

  /** Capture文件任务仍持有数据时禁止Clear，包含取消后的清理阶段。 */
  hasPendingCaptureTransfers(): boolean {
    for (const jobId of this.pendingTransfersById.keys()) {
      const kind = this.jobs.get(jobId)!.kind;
      if (kind === 'body-export' || kind === 'har-export' || kind === 'har-import' ||
        kind === 'archive-export' || kind === 'archive-import') {
        return true;
      }
    }
    return false;
  }

  /** 请求取消并等待任务确认结果；成功提交不被迟到取消覆盖。 */
  async cancel(jobId: string): Promise<TransferJobSnapshot | null> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }
    if (job.state === 'running') {
      job.abortController.abort(new DOMException('Transfer cancelled.', 'AbortError'));
    }
    await this.pendingTransfersById.get(jobId);
    return TransferService.toSnapshot(job);
  }

  /** 取消运行中任务并等待已接受的操作清理；CoreApplication关闭时先于Capture释放。 */
  async cancelAll(): Promise<void> {
    await Promise.allSettled(Array.from(this.jobs.keys(), (jobId) => this.cancel(jobId)));
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
      abortController: new AbortController(),
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
      const result = await operation(job.abortController.signal, (progress) => {
        if (job.state === 'running') {
          job.processed = progress.processed;
          job.total = progress.total;
        }
      });
      job.state = 'completed';
      job.processed = result.processed;
      job.total = result.total;
      job.warnings = [...result.warnings];
      job.completedAt = new Date().toISOString();
      this.completedListener?.(job.kind);
    } catch (error) {
      if (job.abortController.signal.aborted && (
        error === job.abortController.signal.reason ||
        (error instanceof Error && error.name === 'AbortError')
      )) {
        job.state = 'cancelled';
        job.message = 'Transfer cancelled.';
      } else {
        job.state = 'failed';
        job.message = TransferService.publicErrorMessage(error);
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
      (error.name === 'InvalidHarError' || error.name === 'InvalidArchiveError')
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
