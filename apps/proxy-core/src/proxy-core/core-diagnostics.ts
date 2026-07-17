import { AsyncLocalStorage } from 'node:async_hooks';
import process from 'node:process';

import type {
  CoreCommand,
  DiagnosticAttribute,
  DiagnosticLevel,
  DiagnosticLogRecord,
  DiagnosticOutcome,
} from '@interceptor/core-protocol';

import {
  DIAGNOSTICS_RING_MAX_BYTES,
  DIAGNOSTICS_RING_MAX_OUTPUT_RECORDS,
  DIAGNOSTICS_RING_MAX_RECORDS,
} from './constants';

interface DiagnosticContext {
  traceId: string;
  requestId: string;
  command: CoreCommand['type'];
}

export interface DiagnosticFields {
  action?: string;
  durationMs?: number;
  outcome?: DiagnosticOutcome;
  errorCode?: string;
  attributes?: Record<string, DiagnosticAttribute>;
}

/**
 * 结构化诊断记录器：Core 各组件（RpcServer/Application/Proxy/Storage）用它记录
 * initialize、action、生命周期与 error 关键节点。CoreDiagnostics 是唯一实现。
 */
export interface DiagnosticsRecorder {
  info(phase: string, fields?: DiagnosticFields): void;
  warn(phase: string, fields?: DiagnosticFields): void;
  error(phase: string, fields?: DiagnosticFields): void;
}

interface StoredRecord {
  record: DiagnosticLogRecord;
  bytes: number;
}

/**
 * 诊断输出汇：CoreDiagnostics 把成批脱敏日志投递给它。由 DiagnosticsWorkerHost 实现
 * （持久化），或默认写 stdout JSON Lines。注入对象而非闭包，避免在装配处构造闭包函数。
 */
export interface DiagnosticsSink {
  sink(records: readonly DiagnosticLogRecord[]): void | Promise<void>;
}

const defaultDiagnosticsSink: DiagnosticsSink = { sink: writeJsonLines };

/**
 * Proxy Core 内非阻塞、有界、结构化的诊断记录器。
 *
 * CoreRpcServer 用 AsyncLocalStorage 建立 command 上下文，CoreApplication 和后续
 * Service 只补充业务 action。内存历史、待输出队列和单条记录均受限；sink/fallback
 * 失败必须被隔离，不能改变 command、网络或存储路径的结果。
 */
export class CoreDiagnostics implements DiagnosticsRecorder {
  private readonly context = new AsyncLocalStorage<DiagnosticContext>();
  private readonly records: StoredRecord[] = [];
  private readonly outputQueue: DiagnosticLogRecord[] = [];
  private readonly maxBytes = DIAGNOSTICS_RING_MAX_BYTES;
  private readonly maxOutputRecords = DIAGNOSTICS_RING_MAX_OUTPUT_RECORDS;
  private readonly maxRecords = DIAGNOSTICS_RING_MAX_RECORDS;

  private bytes = 0;
  private droppedCount = 0;
  private outputScheduled = false;
  private sequence = 0;

  /**
   * 固定输出 sink 并初始化空的 ring-like history 与输出队列；容量与时间源固定为常量/系统时钟。
   * 调用方：CoreApplication 注入 Diagnostics Worker host 作为 sink；无 sink 时默认写 stdout JSON Lines。
   */
  constructor(
    private readonly sinkTarget: DiagnosticsSink = defaultDiagnosticsSink,
  ) {}

  /**
   * 在当前异步调用链绑定 requestId、traceId 和 command，供后续日志自动继承。
   * 调用方：CoreRpcServer.executeRequest 和 respondToDuplicate；operation 结果原样返回。
   */
  runWithCommand<T>(
    requestId: string,
    traceId: string,
    command: CoreCommand['type'],
    operation: () => T,
  ): T {
    return this.context.run({ requestId, traceId, command }, operation);
  }

  /**
   * 记录业务 action 的 started/completed/failed 与耗时，同时保持 operation 语义不变。
   * 调用方：CoreApplication command handler 及后续 Storage/Proxy Service 操作。
   */
  async action<T>(name: string, operation: () => Promise<T> | T): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await operation();
      this.info('action.completed', {
        action: name,
        durationMs: Date.now() - startedAt,
        outcome: 'success',
      });
      return result;
    } catch (error) {
      this.error('action.failed', {
        action: name,
        durationMs: Date.now() - startedAt,
        outcome: 'failed',
        errorCode: readErrorCode(error),
      });
      throw error;
    }
  }

  /** 记录 debug 事件；调用方：需要低优先级细节的 Core 内部组件。 */
  debug(phase: string, fields: DiagnosticFields = {}): void {
    this.record('debug', phase, fields);
  }

  /** 记录正常生命周期事件；调用方：CoreRpcServer 和业务 Service。 */
  info(phase: string, fields: DiagnosticFields = {}): void {
    this.record('info', phase, fields);
  }

  /** 记录可恢复异常；调用方：协议边界和未来 Storage/Proxy Service。 */
  warn(phase: string, fields: DiagnosticFields = {}): void {
    this.record('warn', phase, fields);
  }

  /** 记录失败结果；调用方：CoreRpcServer command 失败路径和业务 Service。 */
  error(phase: string, fields: DiagnosticFields = {}): void {
    this.record('error', phase, fields);
  }

  /**
   * 返回最近的有限记录副本，可选按 traceId 过滤，并附带累计 droppedCount。
   * 调用方：CoreApplication 的 diagnostics.recent command handler；不会暴露内部对象。
   */
  recent(limit: number, traceId?: string): {
    records: DiagnosticLogRecord[];
    droppedCount: number;
  } {
    const matching = traceId
      ? this.records.filter(({ record }) => record.traceId === traceId)
      : this.records;
    return {
      records: matching.slice(-limit).map(({ record }) => ({
        ...record,
        attributes: record.attributes ? { ...record.attributes } : undefined,
      })),
      droppedCount: this.droppedCount,
    };
  }

  /**
   * 规范化并存储一条日志，执行单条/总记录数/总字节数/输出队列四层约束。
   * 调用方：debug/info/warn/error；只安排异步输出，不同步调用 sink。
   */
  private record(
    level: DiagnosticLevel,
    phase: string,
    fields: DiagnosticFields,
  ): void {
    const context = this.context.getStore();
    const record: DiagnosticLogRecord = {
      timestamp: new Date().toISOString(),
      sequence: ++this.sequence,
      level,
      process: 'proxy-core',
      phase: sanitizeIdentifier(phase, 'log.phase'),
      ...(context ?? {}),
      action: fields.action
        ? sanitizeIdentifier(fields.action, 'log.action')
        : undefined,
      durationMs: sanitizeDuration(fields.durationMs),
      outcome: fields.outcome,
      errorCode: fields.errorCode
        ? sanitizeIdentifier(fields.errorCode, 'log.error')
        : undefined,
      attributes: fields.attributes
        ? sanitizeAttributes(fields.attributes)
        : undefined,
    };
    const bytes = approximateBytes(record);

    if (bytes > this.maxBytes) {
      this.droppedCount += 1;
      this.fallbackSafely('Oversized diagnostic record was dropped.');
      return;
    }

    this.records.push({ record, bytes });
    this.bytes += bytes;
    while (
      this.records.length > this.maxRecords ||
      this.bytes > this.maxBytes
    ) {
      const removed = this.records.shift();
      if (!removed) {
        break;
      }
      this.bytes -= removed.bytes;
      this.droppedCount += 1;
    }

    if (this.outputQueue.length >= this.maxOutputRecords) {
      this.droppedCount += 1;
      return;
    }
    this.outputQueue.push(record);
    this.scheduleOutput();
  }

  /**
   * 为当前输出批次最多安排一个 setImmediate flush，避免 command 路径同步写 I/O。
   * 调用方：record 在成功进入 outputQueue 后。
   */
  private scheduleOutput(): void {
    if (this.outputScheduled) {
      return;
    }
    this.outputScheduled = true;
    setImmediate(() => this.flushOutput());
  }

  /**
   * 一次性取走当前输出队列并调用 sink；同步抛错和异步 rejection 都转入 fallback。
   * 调用方：scheduleOutput 安排的 setImmediate callback。
   */
  private flushOutput(): void {
    this.outputScheduled = false;
    const batch = this.outputQueue.splice(0);
    if (batch.length === 0) {
      return;
    }

    try {
      const output = this.sinkTarget.sink(batch);
      if (isPromiseLike(output)) {
        void output.catch((error: unknown) => {
          this.fallbackSafely(
            `Diagnostic sink failed: ${readErrorCode(error)}`,
          );
        });
      }
    } catch (error) {
      this.fallbackSafely(
        `Diagnostic sink failed: ${readErrorCode(error)}`,
      );
    }
  }

  /**
   * 尝试报告 Diagnostics 自身故障，并吞掉 fallback 异常以保护业务路径。
   * 调用方：oversized record 丢弃和 flushOutput sink 失败处理。
   */
  private fallbackSafely(message: string): void {
    try {
      writeFallback(message);
    } catch {
      // Diagnostics must never fail the command or network path.
    }
  }
}

function sanitizeAttributes(
  attributes: Record<string, DiagnosticAttribute>,
): Record<string, DiagnosticAttribute> {
  const sanitized: Record<string, DiagnosticAttribute> = {};
  for (const [index, [key, value]] of Object.entries(attributes).entries()) {
    if (index >= 32) {
      break;
    }
    const safeKey = sanitizeAttributeKey(key, index);
    sanitized[safeKey] = isSensitiveAttributeKey(key)
      ? '[REDACTED]'
      : typeof value === 'string'
        ? value.slice(0, 512)
        : value;
  }
  return sanitized;
}

function sanitizeAttributeKey(key: string, index: number): string {
  const normalized = key.replace(/[^A-Za-z0-9._-]/g, '_');
  const prefixed = /^[A-Za-z]/.test(normalized)
    ? normalized
    : `attribute_${normalized}`;
  const suffix = `_${index}`;
  return `${prefixed.slice(0, 64 - suffix.length)}${suffix}`;
}

function sanitizeIdentifier(value: string, fallback: string): string {
  const normalized = value.replace(/[^A-Za-z0-9._:-]/g, '_');
  const prefixed = /^[A-Za-z0-9]/.test(normalized)
    ? normalized
    : `${fallback}_${normalized}`;
  return prefixed.slice(0, 128) || fallback;
}

function sanitizeDuration(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function isSensitiveAttributeKey(key: string): boolean {
  return /authorization|body|cookie|password|query|secret|token|url|certificate|private[_-]?key|api[_-]?key/i.test(
    key,
  );
}

function approximateBytes(record: DiagnosticLogRecord): number {
  try {
    return Buffer.byteLength(JSON.stringify(record), 'utf8');
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function writeJsonLines(records: readonly DiagnosticLogRecord[]): void {
  process.stdout.write(`${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
}

function writeFallback(message: string): void {
  process.stderr.write(`[diagnostics] ${message}\n`);
}

function readErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code.slice(0, 128);
  }
  return error instanceof Error ? error.name : 'unknown';
}

function isPromiseLike(value: unknown): value is Promise<void> {
  return typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function';
}