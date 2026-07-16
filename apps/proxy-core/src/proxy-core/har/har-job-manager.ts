import path from 'node:path';

import type { TransferJobSnapshot } from '@interceptor/core-protocol';

import { MAX_TRANSFER_JOBS } from './har-constants';
import type {
  HarExportOptions,
  HarTransferOperation,
  HarTransferService,
  MutableTransferJob,
} from './interfaces';

export class HarJobManager {
  /** 有界保存运行中与最近完成的 HAR 任务。 */
  private readonly jobs = new Map<string, MutableTransferJob>();
  /** 执行实际文件转换的 HAR 服务。 */
  private readonly service: HarTransferService;

  /** 绑定实际转换服务；manager 只负责任务状态和取消。 */
  constructor(service: HarTransferService) {
    this.service = service;
  }

  /** 创建导出任务并异步启动，不阻塞 start command。 */
  startExport(
    jobId: string,
    filePath: string,
    options: HarExportOptions,
  ): TransferJobSnapshot {
    const job = this.create(jobId, 'har-export', filePath);
    void this.run(job, (signal, onProgress) =>
      this.service.exportToFile(filePath, options, signal, onProgress));
    return HarJobManager.toSnapshot(job);
  }

  /** 创建导入任务并异步启动，不阻塞 start command。 */
  startImport(jobId: string, filePath: string): TransferJobSnapshot {
    const job = this.create(jobId, 'har-import', filePath);
    void this.run(job, (signal, onProgress) =>
      this.service.importFromFile(filePath, signal, onProgress));
    return HarJobManager.toSnapshot(job);
  }

  /** 返回指定任务的不可变公开快照；未知 ID 返回 null。 */
  get(jobId: string): TransferJobSnapshot | null {
    const job = this.jobs.get(jobId);
    return job ? HarJobManager.toSnapshot(job) : null;
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
    return HarJobManager.toSnapshot(job);
  }

  /** 取消所有运行中任务；CoreApplication 关闭时用于终止文件 I/O。 */
  cancelAll(): void {
    for (const jobId of this.jobs.keys()) {
      this.cancel(jobId);
    }
  }

  /** 校验 ID 唯一性、清理历史并建立初始 running 状态。 */
  private create(
    jobId: string,
    kind: TransferJobSnapshot['kind'],
    filePath: string,
  ): MutableTransferJob {
    if (this.jobs.has(jobId)) {
      throw new Error('Transfer job ID is already active.');
    }
    this.prune();
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
    operation: HarTransferOperation,
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
        job.message = HarJobManager.publicErrorMessage(error);
      }
      job.completedAt ??= new Date().toISOString();
    }
  }

  /** 在达到容量上限时优先淘汰已结束任务，绝不丢弃运行中任务。 */
  private prune(): void {
    if (this.jobs.size < MAX_TRANSFER_JOBS) {
      return;
    }
    for (const [jobId, job] of this.jobs) {
      if (job.state !== 'running') {
        this.jobs.delete(jobId);
        if (this.jobs.size < MAX_TRANSFER_JOBS) {
          return;
        }
      }
    }
    throw new Error('Too many HAR transfers are active.');
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
    if (error instanceof Error && error.name === 'InvalidHarError') {
      return error.message;
    }
    if (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string'
    ) {
      return `File operation failed (${error.code}).`;
    }
    return 'HAR transfer failed.';
  }
}