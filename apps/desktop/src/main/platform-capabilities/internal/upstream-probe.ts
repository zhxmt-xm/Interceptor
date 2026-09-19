import net from 'node:net';
import type { UpstreamProxyConfig } from '@interceptor/core-protocol';
import { upstreamProbeUrl } from './upstream';

/** 上游探活的默认端口，按协议推断。 */
const DEFAULT_PORTS: Record<string, number> = {
  'http:': 80,
  'https:': 443,
  'socks:': 1080,
  'socks4:': 1080,
  'socks4a:': 1080,
  'socks5:': 1080,
  'socks5h:': 1080,
};

/**
 * 周期性探测上游代理是否可达。
 *
 * 接管系统代理后用户失去了对出口的控制：上游（例如本地 Clash）一旦退出，所有外网流量
 * 都会卡在一个死端口上且无法自愈。这里用回环 TCP 连接做探活（单次约 0.1ms），失败时让
 * 调用方降级直连并告警，恢复后再自动升级回上游。
 *
 * PAC 上游不参与探活：真正的出口由脚本在每次请求时决定，探 PAC 服务器不能代表出口可用。
 */
export class UpstreamProbe {
  /** 周期定时器；未监视时为 null。 */
  private timer: NodeJS.Timeout | null = null;
  /** 当前监视的上游地址；null 表示未在监视。 */
  private target: { host: string; port: number } | null = null;
  /** 最近一次探活结论，用于只在跃迁时通知调用方。 */
  private reachable = true;
  /** 防止上一轮探测未结束时重入。 */
  private probing = false;

  /**
   * @param intervalMs 探活周期。
   * @param timeoutMs 单次连接超时；必须小于周期，否则探测会相互重叠。
   * @param onChange 可达性发生跃迁时回调。
   */
  constructor(
    private readonly intervalMs: number,
    private readonly timeoutMs: number,
    private readonly onChange: (reachable: boolean) => void,
  ) {}

  /**
   * 开始监视一个上游；无法解析出 host:port（如 PAC）时不监视。
   * 立即探一次而不是等第一个周期：调用方是乐观下发上游的，上游若一开始就不可达，
   * 等满一个周期意味着这段时间内所有请求都打在死端口上。
   * 调用方：Main 在接管系统代理并下发上游之后。
   */
  start(upstream: UpstreamProxyConfig | null): void {
    this.stop();
    const proxyUrl = upstreamProbeUrl(upstream);
    if (!proxyUrl) return;
    this.target = UpstreamProbe.parseTarget(proxyUrl);
    if (!this.target) {
      return;
    }
    this.reachable = true;
    this.timer = setInterval(() => void this.probe(), this.intervalMs);
    this.timer.unref();
    void this.probe();
  }

  /** 停止监视并复位状态。调用方：Main 在还原系统代理或退出时。 */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.target = null;
    this.reachable = true;
  }

  /** 单次探活；只在结论跃迁时通知调用方。 */
  private async probe(): Promise<void> {
    const target = this.target;
    if (!target || this.probing) {
      return;
    }
    this.probing = true;
    try {
      const reachable = await UpstreamProbe.canConnect(target, this.timeoutMs);
      if (this.target !== target) {
        return;
      }
      if (reachable !== this.reachable) {
        this.reachable = reachable;
        this.onChange(reachable);
      }
    } finally {
      this.probing = false;
    }
  }

  /** 尝试建立一次 TCP 连接，成功即认为上游在线。 */
  private static canConnect(
    target: { host: string; port: number },
    timeoutMs: number,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.connect({ host: target.host, port: target.port });
      const settle = (reachable: boolean): void => {
        socket.destroy();
        resolve(reachable);
      };
      socket.once('connect', () => settle(true));
      socket.once('error', () => settle(false));
      socket.setTimeout(timeoutMs, () => settle(false));
    });
  }

  /** 从上游 URL 取出可探测的 host:port；PAC 与畸形值返回 null。 */
  private static parseTarget(
    proxyUrl: string,
  ): { host: string; port: number } | null {
    try {
      const url = new URL(proxyUrl);
      const port = url.port.length > 0
        ? Number(url.port)
        : DEFAULT_PORTS[url.protocol];
      if (!port || url.hostname.length === 0) {
        return null;
      }
      return { host: url.hostname, port };
    } catch {
      return null;
    }
  }
}
