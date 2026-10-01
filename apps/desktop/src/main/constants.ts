/**
 * Main 层顶层常量集中于此。
 *
 * 只收纳与具体 Service class 无强绑定、跨用途的纯常量；语言/本地化数据不属于此处
 * （见 main/i18n/），仅服务单一 class 的常量作为该 class 的 private static readonly 保留。
 */

/** 诊断级别枚举；供 Renderer 诊断过滤输入的白名单校验。 */
export const DIAGNOSTIC_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

/** 导入文件读取上限：规则树与集合都是几十到几百条，超过它的输入必定不是本产品导出的。 */
export const IMPORT_FILE_MAX_BYTES = 8 * 1024 * 1024;

/** 诊断来源进程枚举；供 Renderer 诊断过滤输入的白名单校验。 */
export const DIAGNOSTIC_PROCESSES = ['core', 'main', 'renderer'] as const;

/** 诊断结果枚举；供 Renderer 诊断过滤输入的白名单校验。 */
export const DIAGNOSTIC_OUTCOMES = [
  'success',
  'failed',
  'cancelled',
  'timed_out',
] as const;
