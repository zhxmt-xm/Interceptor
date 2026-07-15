/**
 * 诊断模块对外入口。
 *
 * CoreApplication 通过它获取 Diagnostics Worker host 与查询类型，不直接依赖 host/
 * 与 worker/ 内部文件布局。与 storage/entry.ts 对称。
 */
export { DiagnosticsWorkerHost } from './host/host-worker';
export type { DiagnosticsPage, DiagnosticsQuery } from './worker/worker-store';
