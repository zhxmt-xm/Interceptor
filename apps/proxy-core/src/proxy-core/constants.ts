/**
 * Proxy Core 唯一的常量与运行期配置模块。
 *
 * 所有静态常量集中在此，是唯一取值来源；单元测试通过 vi.mock 覆盖，不向生产构造函数注入
 * 仅测试用的参数。读 process.argv / __dirname 的运行期值（dataDir、appVersion、worker
 * bundle 路径）也集中在此，由 entry 启动时经 initializeCoreRuntime 初始化，深层模块经
 * coreRuntimeConfig 只读获取，避免 dataDir/worker 路径逐层透传。总览见 apps/proxy-core/CONSTANTS.md。
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// ===== CoreApplication 生命周期 =====
/** CoreApplication 向 Main 发送 heartbeat 的间隔。 */
export const HEARTBEAT_INTERVAL_MS = 1_000;
/** 捕获事件批量 flush 的间隔。 */
export const EVENT_FLUSH_INTERVAL_MS = 50;
/** 同时在途、等待ack的事件批次数；队列总量不受此窗口限制。 */
export const EVENT_INFLIGHT_WINDOW_SIZE = 8;
/** 单次从捕获事件队列取走的最大事件数。 */
export const EVENT_DRAIN_BATCH = 200;

// ===== 存储（临时 Capture/Body + 持久工作区配置） =====
/** 持久工作区配置数据库文件名（dataDir 下）。 */
export const WORKSPACE_DB_FILE = 'workspace.sqlite';
/** 当前 Core 代际的临时 Body spill 目录名。 */
export const CAPTURE_TEMP_DIR = 'capture-temp';
/** Body 保留在内存中的最大字节数；超过后异步 spill。 */
export const BODY_MEMORY_THRESHOLD_BYTES = 3 * 1024 * 1024;
/**
 * 单个增量正文写入器允许积压的待落盘字节上限。
 *
 * `write()` 由 Mockttp 的 body-data 回调同步调用且返回值被忽略，无法向上游施加背压，
 * 因此 chunk 只能先入内存队列再串行落盘。本上限是**病态兜底**而非常规限制：取值远高于
 * 真实流量的积压水位，保证正常场景（含大文件下载）正文完整保留；只有当磁盘持续远慢于
 * 接收速度（磁盘异常或极端本地源站）时才触发降级，避免 Core 内存无界增长。
 */
export const BODY_WRITER_PENDING_LIMIT_BYTES = 128 * 1024 * 1024;
// ===== 诊断（持久化日志库） =====
/** 诊断数据库文件名（dataDir 下）。 */
export const DIAGNOSTICS_DB_FILE = 'diagnostics.sqlite';
/** Diagnostics JSONL 导出时每页读取的记录数。 */
export const DIAGNOSTICS_EXPORT_PAGE_SIZE = 1_000;

// ===== 代理 =====
/** 显式代理默认绑定的 loopback 地址。 */
export const DEFAULT_PROXY_HOST = '127.0.0.1';
// ===== 运行期变量（读 process.argv / __dirname，entry 启动时经 initializeRuntime 赋值） =====
//
// 这些是模块级可变变量：Core 启动时由 entry 调用 initializeRuntime 一次确定取值（worker
// bundle 路径依赖 __dirname、dataDir 依赖 process.argv，必须运行时求值），其余模块直接
// import 只读使用，避免 dataDir、worker bundle 路径经多层构造函数透传。

/** 存储根目录；无 --data-dir 时为 null，Core 以无存储模式运行。 */
export let dataDir: string | null = null;
/** 应用版本（--app-version），用于捕获会话元数据。 */
export let appVersion = '0.0.0';
/** workspace.sqlite 绝对路径；持久保存跨 Recording 的低频配置。 */
export let workspaceDatabasePath = '';
/** 当前 Core 代际的临时 Body spill 目录绝对路径。 */
export let captureTempDirectory = '';
/** diagnostics.sqlite 绝对路径。 */
export let diagnosticsDatabasePath = '';
/** 已构建的一次性 Archive Worker bundle 绝对路径。 */
export let archiveWorkerEntry = '';
/** 已构建的 Diagnostics Worker bundle 绝对路径。 */
export let diagnosticsWorkerEntry = '';
/** 本机客户端应用 helper 路径（--client-app-helper）；平台不支持时为 null。 */
export let clientAppHelperPath: string | null = null;

/**
 * 解析 Main 经 fork 参数注入的运行期值并解析 worker bundle 路径，赋给上面的模块变量。
 * 调用方：entry.cts 启动时调用一次（确保 path 正确）；单元测试用测试 argv 调用以驱动真实组件。
 */
export function initializeRuntime(argv: readonly string[]): void {
  dataDir = readArg(argv, '--data-dir=') ?? null;
  appVersion = readArg(argv, '--app-version=') ?? '0.0.0';
  workspaceDatabasePath = dataDir ? path.join(dataDir, WORKSPACE_DB_FILE) : '';
  captureTempDirectory = dataDir ? path.join(dataDir, CAPTURE_TEMP_DIR) : '';
  diagnosticsDatabasePath = dataDir
    ? path.join(dataDir, DIAGNOSTICS_DB_FILE)
    : '';
  archiveWorkerEntry = resolveWorkerEntry('archive');
  diagnosticsWorkerEntry = resolveWorkerEntry('diagnostics');
  clientAppHelperPath = readArg(argv, '--client-app-helper=') ?? null;
}

/**
 * 解析已构建的 worker bundle 路径，无需注入。
 * 生产：constants 打包进 dist/proxy-core/entry.cjs（__dirname=dist/proxy-core），worker 在
 * 同包 <module>/worker 下，existsSync 命中。从源码运行（vitest）时回落到工作区已构建 dist。
 */
function resolveWorkerEntry(moduleDir: 'archive' | 'diagnostics'): string {
  const bundled = path.join(__dirname, moduleDir, 'worker', 'entry.cjs');
  return existsSync(bundled)
    ? bundled
    : path.resolve(
        process.cwd(),
        `dist/proxy-core/${moduleDir}/worker/entry.cjs`,
      );
}

function readArg(argv: readonly string[], prefix: string): string | undefined {
  const arg = argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}
