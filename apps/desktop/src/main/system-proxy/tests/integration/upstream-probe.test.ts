import net from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UpstreamProbe } from '../../upstream-probe';

const INTERVAL_MS = 20;
const TIMEOUT_MS = 10;

/** 起一个只接受连接的本地 TCP 服务，代表在线的上游代理。 */
async function startListener(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** 取一个当前没有监听者的端口，代表已退出的上游代理。 */
async function findClosedPort(): Promise<number> {
  const listener = await startListener();
  await listener.close();
  return listener.port;
}

describe('UpstreamProbe', () => {
  let upstreamProbe: UpstreamProbe | null = null;

  afterEach(() => {
    upstreamProbe?.stop();
    upstreamProbe = null;
  });

  it('stays quiet while the upstream keeps accepting connections', async () => {
    const listener = await startListener();
    const onChange = vi.fn();
    upstreamProbe = new UpstreamProbe(INTERVAL_MS, TIMEOUT_MS, onChange);

    upstreamProbe.start(`http://127.0.0.1:${listener.port}`);
    await vi.waitFor(() => new Promise((resolve) => setTimeout(resolve, INTERVAL_MS * 3)));

    expect(onChange).not.toHaveBeenCalled();
    await listener.close();
  });

  // 上游一开始就不可达时也必须立刻降级，否则这段时间内所有请求都打在死端口上。
  it('reports unreachable without waiting for a full interval', async () => {
    const port = await findClosedPort();
    const onChange = vi.fn();
    upstreamProbe = new UpstreamProbe(10_000, TIMEOUT_MS, onChange);

    upstreamProbe.start(`http://127.0.0.1:${port}`);

    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(false);
    });
  });

  it('reports recovery once the upstream comes back', async () => {
    const listener = await startListener();
    const { port } = listener;
    await listener.close();
    const onChange = vi.fn();
    upstreamProbe = new UpstreamProbe(INTERVAL_MS, TIMEOUT_MS, onChange);

    upstreamProbe.start(`http://127.0.0.1:${port}`);
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(false);
    });

    const revived = net.createServer();
    await new Promise<void>((resolve) => revived.listen(port, '127.0.0.1', resolve));
    try {
      await vi.waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(true);
      });
    } finally {
      await new Promise<void>((resolve) => revived.close(() => resolve()));
    }
  });

  // PAC 的真实出口由脚本每次请求决定，探 PAC 服务器不能代表出口可用。
  it('does not watch PAC upstreams', async () => {
    const onChange = vi.fn();
    upstreamProbe = new UpstreamProbe(INTERVAL_MS, TIMEOUT_MS, onChange);

    upstreamProbe.start('pac+http://proxy.example.com/proxy.pac');
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS * 3));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops reporting after stop()', async () => {
    const port = await findClosedPort();
    const onChange = vi.fn();
    upstreamProbe = new UpstreamProbe(INTERVAL_MS, TIMEOUT_MS, onChange);

    upstreamProbe.start(`http://127.0.0.1:${port}`);
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(false);
    });
    upstreamProbe.stop();
    onChange.mockClear();
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS * 3));

    expect(onChange).not.toHaveBeenCalled();
  });
});
