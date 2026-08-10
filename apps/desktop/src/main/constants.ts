/**
 * Main 层顶层常量集中于此。
 *
 * 只收纳与具体 Service class 无强绑定、跨用途的纯常量；语言/本地化数据不属于此处
 * （见 main/i18n/），仅服务单一 class 的常量作为该 class 的 private static readonly 保留。
 */

/** 诊断级别枚举；供 Renderer 诊断过滤输入的白名单校验。 */
export const DIAGNOSTIC_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

/**
 * 断点替换文件顺便读出文本做预览的阀值，不是能不能用的上限。
 * 超过它只是不预览，文件照样可以替换正文——真正的正文由 Core 按路径直读。
 */
export const BREAKPOINT_BODY_FILE_PREVIEW_BYTES = 1024 * 1024;

/** 上游探活周期；回环 TCP 单次约 0.1ms，每秒一次开销可忽略。 */
export const UPSTREAM_PROBE_INTERVAL_MS = 1000;

/** 单次探活超时；必须小于周期，否则探测会相互重叠。 */
export const UPSTREAM_PROBE_TIMEOUT_MS = 500;

/** 诊断来源进程枚举；供 Renderer 诊断过滤输入的白名单校验。 */
export const DIAGNOSTIC_PROCESSES = ['core', 'main', 'renderer'] as const;

/** 诊断结果枚举；供 Renderer 诊断过滤输入的白名单校验。 */
export const DIAGNOSTIC_OUTCOMES = [
  'success',
  'failed',
  'cancelled',
  'timed_out',
] as const;
