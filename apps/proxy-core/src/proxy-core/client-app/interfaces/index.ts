import type { ClientAppIdentity } from '@interceptor/core-protocol';

/** 执行本机进程反查 helper 的运行器；生产使用无 shell 的 execFile。 */
export type ClientAppLookupRunner = (
  helperPath: string,
  args: readonly string[],
) => Promise<string>;

export interface ClientAppServiceOptions {
  /** 本机进程反查 helper 的可执行文件路径；缺省表示当前平台不支持。 */
  readonly helperPath?: string | undefined;
  /** 可注入的运行器；单元测试用假实现替换真实 helper。 */
  readonly runner?: ClientAppLookupRunner | undefined;
}

export type { ClientAppIdentity };
