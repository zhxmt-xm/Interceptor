import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import type { McpClientIdentity, McpClientRegistration } from '../interfaces';

/**
 * per-client token 认证。token 只存在于内存中，进程退出即失效，
 * 因此不需要持久化，也无法在 app 未运行时被重放。
 */
export class McpTokenAuthenticator {
  /** clientId → 该接入的 token 明文与展示名。 */
  readonly #clients = new Map<string, { label: string; token: Buffer }>();

  /** 新增一个接入，返回其一次性 token 明文。 */
  register(label: string): McpClientRegistration {
    const clientId = randomUUID();
    const token = randomBytes(32).toString('base64url');
    this.#clients.set(clientId, { label, token: Buffer.from(token, 'utf8') });
    return { clientId, label, token };
  }

  /** 撤销一个接入；宿主负责断开其在途连接。 */
  revoke(clientId: string): boolean {
    return this.#clients.delete(clientId);
  }

  /** 已注册接入的展示信息，不含 token。 */
  list(): readonly { clientId: string; label: string }[] {
    return [...this.#clients.entries()].map(([clientId, entry]) => ({
      clientId,
      label: entry.label,
    }));
  }

  /**
   * 校验 token 并产出可信身份。
   *
   * `reportedName` 来自 MCP initialize 的 clientInfo，是调用方自报的，
   * 只用于展示与审计，不参与任何授权判断。
   */
  authenticate(token: string, reportedName?: string): McpClientIdentity | null {
    const candidate = Buffer.from(token, 'utf8');
    for (const [clientId, entry] of this.#clients) {
      if (equalsInConstantTime(candidate, entry.token)) {
        return {
          clientId,
          label: entry.label,
          ...(reportedName === undefined ? {} : { reportedName }),
        };
      }
    }
    return null;
  }

  /** 全部撤销；关闭 MCP 时调用。 */
  clear(): void {
    this.#clients.clear();
  }
}

/** 定长比较；长度不同也走一次比较以免长度本身成为侧信道。 */
function equalsInConstantTime(left: Buffer, right: Buffer): boolean {
  if (left.length !== right.length) {
    timingSafeEqual(right, right);
    return false;
  }
  return timingSafeEqual(left, right);
}
