import { timingSafeEqual } from 'node:crypto';

import type { McpClientIdentity, McpClientRegistration } from '../interfaces';

/** per-client token认证；持久化策略由Desktop宿主拥有。 */
export class McpTokenAuthenticator {
  /** clientId → 该接入的 token 明文与展示名。 */
  readonly #clients = new Map<string, { label: string; token: Buffer }>();

  /** 恢复宿主从加密Store读取的完整Client集合。 */
  restore(registrations: readonly McpClientRegistration[]): void {
    const clients = new Map<string, { label: string; token: Buffer }>();
    const tokens = new Set<string>();
    for (const registration of registrations) {
      if (clients.has(registration.clientId)) {
        throw new Error(`Duplicate client id "${registration.clientId}".`);
      }
      if (tokens.has(registration.token)) {
        throw new Error('Duplicate token.');
      }
      clients.set(registration.clientId, {
        label: registration.label,
        token: Buffer.from(registration.token, 'utf8'),
      });
      tokens.add(registration.token);
    }
    this.#clients.clear();
    for (const [clientId, client] of clients) {
      this.#clients.set(clientId, client);
    }
  }

  /** 已注册接入的展示信息，不含 token。 */
  list(): readonly { clientId: string; label: string }[] {
    return [...this.#clients.entries()].map(([clientId, entry]) => ({
      clientId,
      label: entry.label,
    }));
  }

  /** 校验token并产出可信身份。 */
  authenticate(token: string): McpClientIdentity | null {
    const candidate = Buffer.from(token, 'utf8');
    for (const [clientId, entry] of this.#clients) {
      if (equalsInConstantTime(candidate, entry.token)) {
        return {
          clientId,
          label: entry.label,
        };
      }
    }
    return null;
  }

  /** 按可信Client ID读取当前身份；已撤销Client返回null。 */
  identity(clientId: string): McpClientIdentity | null {
    const client = this.#clients.get(clientId);
    return client === undefined ? null : { clientId, label: client.label };
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
