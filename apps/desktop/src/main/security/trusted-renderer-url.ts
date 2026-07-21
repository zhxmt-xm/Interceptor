import type { TrustedRendererUrlOptions } from '../interfaces';

/** 判定 Renderer 导航/IPC 来源 URL 是否可信（开发精确同源 / 生产精确入口）。 */
export class TrustedRendererUrl {
  /** 开发态精确同源；生产态精确匹配 packaged 入口 URL。 */
  static isTrusted(
    candidateUrl: string,
    options: TrustedRendererUrlOptions,
  ): boolean {
    try {
      const candidate = new URL(candidateUrl);

      if (options.devServerUrl) {
        return candidate.origin === new URL(options.devServerUrl).origin;
      }

      const packaged = new URL(options.packagedRendererUrl);
      return candidate.protocol === packaged.protocol &&
        candidate.host === packaged.host &&
        candidate.username === packaged.username &&
        candidate.password === packaged.password &&
        candidate.pathname === packaged.pathname;
    } catch {
      return false;
    }
  }
}