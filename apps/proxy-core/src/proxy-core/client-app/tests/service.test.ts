import { describe, expect, it, vi } from 'vitest';

import { ClientAppService } from '../entry';
import type { ClientAppLookupRunner } from '../interfaces';

/** helper 输出一行：源端口 / 进程 ID / 显示名 / 可执行文件路径。 */
function helperLine(
  sourcePort: number,
  processId: number,
  displayName: string,
  imagePath: string,
): string {
  return `${sourcePort}\t${processId}\t${displayName}\t${imagePath}\n`;
}

describe('ClientAppService', () => {
  it('reports unsupported and never resolves without a helper path', async () => {
    const runner = vi.fn<ClientAppLookupRunner>();
    const clientAppService = new ClientAppService({ runner });
    clientAppService.setProxyPort(8888);

    expect(clientAppService.supported).toBe(false);
    await expect(clientAppService.resolveAppForPort(50_000)).resolves.toBeNull();
    expect(runner).not.toHaveBeenCalled();
  });

  it('resolves a source port to the owning application', async () => {
    const runner = vi.fn<ClientAppLookupRunner>(async () =>
      helperLine(50_000, 4242, 'Google Chrome', 'C:\\Chrome\\chrome.exe'),
    );
    const clientAppService = new ClientAppService({ helperPath: 'helper.exe', runner });
    clientAppService.setProxyPort(8888);

    const identity = await clientAppService.resolveAppForPort(50_000);

    expect(identity?.name).toBe('Google Chrome');
    expect(identity?.path).toBe('C:\\Chrome\\chrome.exe');
    expect(runner).toHaveBeenCalledWith('helper.exe', ['8888']);
  });

  it('serves later requests from the snapshot without launching the helper again', async () => {
    const runner = vi.fn<ClientAppLookupRunner>(async () =>
      [
        helperLine(50_000, 4242, 'Google Chrome', 'C:\\Chrome\\chrome.exe'),
        helperLine(50_001, 4242, 'Google Chrome', 'C:\\Chrome\\chrome.exe'),
      ].join(''),
    );
    const clientAppService = new ClientAppService({ helperPath: 'helper.exe', runner });
    clientAppService.setProxyPort(8888);

    await clientAppService.resolveAppForPort(50_000);
    expect(clientAppService.cachedAppForPort(50_001)?.name).toBe('Google Chrome');
    await clientAppService.resolveAppForPort(50_001);

    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent lookups into a single helper run', async () => {
    const runner = vi.fn<ClientAppLookupRunner>(async () =>
      [
        helperLine(50_000, 4242, 'Google Chrome', 'C:\\Chrome\\chrome.exe'),
        helperLine(50_001, 7, 'Node.js', 'C:\\node\\node.exe'),
      ].join(''),
    );
    const clientAppService = new ClientAppService({ helperPath: 'helper.exe', runner });
    clientAppService.setProxyPort(8888);

    const [first, second] = await Promise.all([
      clientAppService.resolveAppForPort(50_000),
      clientAppService.resolveAppForPort(50_001),
    ]);

    expect(first?.name).toBe('Google Chrome');
    expect(second?.name).toBe('Node.js');
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('drops rows whose executable path is unreadable', async () => {
    const runner = vi.fn<ClientAppLookupRunner>(async () =>
      `50000\t4\t\t\n${helperLine(50_001, 7, 'Node.js', 'C:\\node\\node.exe')}`,
    );
    const clientAppService = new ClientAppService({ helperPath: 'helper.exe', runner });
    clientAppService.setProxyPort(8888);

    await expect(clientAppService.resolveAppForPort(50_000)).resolves.toBeNull();
    expect(clientAppService.cachedAppForPort(50_001)?.name).toBe('Node.js');
  });

  it('falls back to the file name when the executable has no display name', async () => {
    const runner = vi.fn<ClientAppLookupRunner>(async () =>
      helperLine(50_000, 7, '', 'C:\\tools\\curl.exe'),
    );
    const clientAppService = new ClientAppService({ helperPath: 'helper.exe', runner });
    clientAppService.setProxyPort(8888);

    await expect(clientAppService.resolveAppForPort(50_000)).resolves.toMatchObject({
      name: 'curl',
    });
  });

  it('never rejects when the helper fails and backs off from relaunching it', async () => {
    const runner = vi.fn<ClientAppLookupRunner>(async () => {
      throw new Error('helper was blocked');
    });
    const clientAppService = new ClientAppService({ helperPath: 'helper.exe', runner });
    clientAppService.setProxyPort(8888);

    await expect(clientAppService.resolveAppForPort(50_000)).resolves.toBeNull();
    await expect(clientAppService.resolveAppForPort(50_001)).resolves.toBeNull();

    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('expires the snapshot so a reused source port is not attributed to the old app', async () => {
    vi.useFakeTimers();
    try {
      const runner = vi
        .fn<ClientAppLookupRunner>()
        .mockResolvedValueOnce(
          helperLine(50_000, 4242, 'Google Chrome', 'C:\\Chrome\\chrome.exe'),
        )
        .mockResolvedValueOnce(
          helperLine(50_000, 7, 'Node.js', 'C:\\node\\node.exe'),
        );
      const clientAppService = new ClientAppService({ helperPath: 'helper.exe', runner });
      clientAppService.setProxyPort(8888);

      await clientAppService.resolveAppForPort(50_000);
      expect(clientAppService.cachedAppForPort(50_000)?.name).toBe('Google Chrome');

      vi.setSystemTime(Date.now() + 16_000);

      expect(clientAppService.cachedAppForPort(50_000)).toBeNull();
      await expect(clientAppService.resolveAppForPort(50_000)).resolves.toMatchObject({
        name: 'Node.js',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('hands each newly seen application to Main exactly once', async () => {
    vi.useFakeTimers();
    try {
      const runner = vi
        .fn<ClientAppLookupRunner>()
        .mockResolvedValueOnce(
          helperLine(50_000, 4242, 'Google Chrome', 'C:\\Chrome\\chrome.exe'),
        )
        .mockResolvedValueOnce(
          [
            helperLine(50_000, 4242, 'Google Chrome', 'C:\\Chrome\\chrome.exe'),
            helperLine(50_001, 7, 'Node.js', 'C:\\node\\node.exe'),
          ].join(''),
        );
      const clientAppService = new ClientAppService({ helperPath: 'helper.exe', runner });
      clientAppService.setProxyPort(8888);

      await clientAppService.resolveAppForPort(50_000);
      const first = clientAppService.pendingAppsForMain();
      expect(first.map((identity) => identity.name)).toEqual(['Google Chrome']);

      clientAppService.markAppsDelivered(first);
      expect(clientAppService.pendingAppsForMain()).toEqual([]);

      // 让新连接的到达时刻严格晚于上一张快照，才会触发重新采样。
      vi.setSystemTime(Date.now() + 1);
      await clientAppService.resolveAppForPort(50_001);
      expect(
        clientAppService.pendingAppsForMain().map((identity) => identity.name),
      ).toEqual(['Node.js']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps undelivered applications queued until a batch actually ships', async () => {
    const runner = vi.fn<ClientAppLookupRunner>(async () =>
      helperLine(50_000, 4242, 'Google Chrome', 'C:\\Chrome\\chrome.exe'),
    );
    const clientAppService = new ClientAppService({ helperPath: 'helper.exe', runner });
    clientAppService.setProxyPort(8888);

    await clientAppService.resolveAppForPort(50_000);

    // 读取不消费：批次发送失败时身份必须留在队列里等下一轮。
    expect(clientAppService.pendingAppsForMain()).toHaveLength(1);
    expect(clientAppService.pendingAppsForMain()).toHaveLength(1);
  });

  it('waits for an in-flight snapshot that started in the same millisecond', async () => {
    vi.useFakeTimers();
    try {
      let releaseHelper: (output: string) => void = () => {};
      const runner = vi.fn<ClientAppLookupRunner>(
        () =>
          new Promise<string>((resolve) => {
            releaseHelper = resolve;
          }),
      );
      const clientAppService = new ClientAppService({ helperPath: 'helper.exe', runner });
      clientAppService.setProxyPort(8888);

      // 两个请求落在同一毫秒：第二个必须等待第一个已经拉起的快照，而不是直接放弃。
      const first = clientAppService.resolveAppForPort(50_000);
      const second = clientAppService.resolveAppForPort(50_001);
      releaseHelper(
        [
          helperLine(50_000, 4242, 'Google Chrome', 'C:\\Chrome\\chrome.exe'),
          helperLine(50_001, 7, 'Node.js', 'C:\\node\\node.exe'),
        ].join(''),
      );

      await expect(first).resolves.toMatchObject({ name: 'Google Chrome' });
      await expect(second).resolves.toMatchObject({ name: 'Node.js' });
      expect(runner).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops the snapshot when the proxy moves to another port', async () => {
    const runner = vi.fn<ClientAppLookupRunner>(async () =>
      helperLine(50_000, 4242, 'Google Chrome', 'C:\\Chrome\\chrome.exe'),
    );
    const clientAppService = new ClientAppService({ helperPath: 'helper.exe', runner });
    clientAppService.setProxyPort(8888);
    await clientAppService.resolveAppForPort(50_000);

    clientAppService.setProxyPort(9999);

    expect(clientAppService.cachedAppForPort(50_000)).toBeNull();
  });
});
