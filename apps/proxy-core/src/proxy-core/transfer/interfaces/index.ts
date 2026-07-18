import type { TransferJobSnapshot } from '@interceptor/core-protocol';

/**
 * Transfer 模块共享的文件任务类型。
 *
 * HAR 与原生 archive 的导入/导出复用同一套异步任务基础设施：同一个进度模型、
 * 同一个有界任务表和同一套取消/终态语义，避免为每种格式重复实现任务生命周期。
 */

export interface TransferProgress {
  /** 已完成处理的条目数量。 */
  readonly processed: number;
  /** 本任务预计处理的条目总数。 */
  readonly total: number;
}

export interface TransferResult extends TransferProgress {
  /** 完成后向用户展示的格式损失或兼容性警告。 */
  readonly warnings: string[];
}

export type TransferProgressListener = (progress: TransferProgress) => void;

export type TransferOperation = (
  signal: AbortSignal,
  onProgress: TransferProgressListener,
) => Promise<TransferResult>;

export interface MutableTransferJob {
  /** Core 内唯一任务标识。 */
  readonly id: string;
  /** 导入或导出任务类型（含 HAR 与原生 archive）。 */
  readonly kind: TransferJobSnapshot['kind'];
  /** 可返回 Renderer 的 basename，不包含绝对目录。 */
  readonly fileName: string;
  /** 任务启动时间。 */
  readonly startedAt: string;
  /** 只属于该任务的取消控制器。 */
  readonly controller: AbortController;
  /** 实际 operation 已退出的 Promise；取消后用于等待 Worker/I/O 收尾。 */
  completion?: Promise<void>;
  /** 当前任务状态。 */
  state: TransferJobSnapshot['state'];
  /** 已处理条目数量。 */
  processed: number;
  /** 预计处理条目总数。 */
  total: number;
  /** 终态写入的完成时间。 */
  completedAt?: string;
  /** 可安全展示且不含绝对路径的状态消息。 */
  message?: string;
  /** 格式损失或兼容性警告。 */
  warnings: string[];
}
