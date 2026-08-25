import { describe, expect, it } from 'vitest';

import type {
  CaptureExchangeEventKind,
  CaptureExchangeSummary,
} from '@interceptor/core-protocol';
import type { InitiatedRequest } from 'mockttp';

import { CaptureService } from '../../../capture/entry';
import type { ExchangeInput, ExchangePatch } from '../../../capture/interfaces';
import { ClientAppService } from '../../../client-app/entry';
import type { ClientAppLookupRunner } from '../../../client-app/interfaces';
import { ExchangeTracker } from '../../internal/exchange-tracker';
import { CaptureEventQueue } from '../../internal/capture-event-queue';

/** Unit-level CaptureService fake that records only Exchange creation and updates. */
class RecordingExchangeCaptureService extends CaptureService {
  /** Exchanges observed by the tracker. */
  readonly exchanges: ExchangeInput[] = [];

  /** Record newly created Exchanges without touching storage. */
  override appendExchanges(
    exchanges: ExchangeInput[],
  ): Promise<{ id: string; seq: number }[]> {
    this.exchanges.push(...exchanges.map((exchange) => ({ ...exchange })));
    return Promise.resolve(
      exchanges.map((exchange, index) => ({ id: exchange.id, seq: index + 1 })),
    );
  }

  /** Merge the tracker fields asserted by this unit test. */
  override updateExchange(patch: ExchangePatch): Promise<void> {
    const index = this.exchanges.findIndex((exchange) => exchange.id === patch.id);
    if (index >= 0) {
      const current = this.exchanges[index]!;
      this.exchanges[index] = {
        ...current,
        ...Object.fromEntries(
          Object.entries(patch).filter(([, value]) => value !== undefined),
        ),
      } as ExchangeInput;
    }
    return Promise.resolve();
  }
}

/** 记录推送顺序的事件队列。 */
class RecordingCaptureEventQueue extends CaptureEventQueue {
  readonly events: Array<{
    kind: CaptureExchangeEventKind;
    summary: CaptureExchangeSummary;
  }> = [];

  override enqueue(
    kind: CaptureExchangeEventKind,
    summary: CaptureExchangeSummary,
  ): void {
    this.events.push({ kind, summary });
  }
}

/** 构造一条来自本机 50000 端口的最小请求。 */
function loopbackRequest(id = 'req-1'): InitiatedRequest {
  return {
    id,
    protocol: 'http',
    httpVersion: '1.1',
    method: 'GET',
    url: 'http://example.test/items',
    path: '/items',
    remoteIpAddress: '127.0.0.1',
    remotePort: 50_000,
    destination: { hostname: 'example.test', port: 80 },
    headers: {},
    rawHeaders: [],
    timingEvents: { startTime: Date.now() },
    tags: [],
  } as unknown as InitiatedRequest;
}

/** 等待一次事件循环迭代，让 setImmediate 排入的解析得以运行。 */
function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('ExchangeTracker client application attribution', () => {
  it('does not create an exchange-ready waiter while recording is paused', async () => {
    const exchangeTracker = new ExchangeTracker(
      new RecordingExchangeCaptureService(),
      new RecordingCaptureEventQueue(),
    );
    exchangeTracker.setSession('session-1');
    exchangeTracker.setRecording(false);
    let settled = false;

    void exchangeTracker.whenExchangeReady('websocket-paused').then((exchangeId) => {
      expect(exchangeId).toBeNull();
      settled = true;
    });
    await nextTick();

    expect(settled).toBe(true);
  });

  it('publishes the exchange before the lookup helper is even touched', async () => {
    let helperCalls = 0;
    const runner: ClientAppLookupRunner = async () => {
      helperCalls += 1;
      // 模拟 helper 挂死：永远不返回。
      return new Promise<string>(() => {});
    };
    const clientAppService = new ClientAppService({ helperPath: 'helper.exe', runner });
    clientAppService.setProxyPort(8888);
    const recordingCaptureEventQueue = new RecordingCaptureEventQueue();
    const exchangeTracker = new ExchangeTracker(new RecordingExchangeCaptureService(), recordingCaptureEventQueue, clientAppService);
    exchangeTracker.setSession('session-1');

    exchangeTracker.beginRequest(loopbackRequest());

    // beginRequest 返回时列表事件必须已经发出，且 helper 尚未被拉起。
    expect(recordingCaptureEventQueue.events).toHaveLength(1);
    expect(recordingCaptureEventQueue.events[0]?.kind).toBe('exchange-added');
    expect(helperCalls).toBe(0);

    await nextTick();
    expect(helperCalls).toBe(1);
    // helper 永不返回，列表也不会因此多出或丢失任何事件。
    expect(recordingCaptureEventQueue.events).toHaveLength(1);
  });

  it('keeps capturing when the lookup helper fails outright', async () => {
    const runner: ClientAppLookupRunner = async () => {
      throw new Error('helper was blocked');
    };
    const clientAppService = new ClientAppService({ helperPath: 'helper.exe', runner });
    clientAppService.setProxyPort(8888);
    const recordingExchangeCaptureService = new RecordingExchangeCaptureService();
    const recordingCaptureEventQueue = new RecordingCaptureEventQueue();
    const exchangeTracker = new ExchangeTracker(recordingExchangeCaptureService, recordingCaptureEventQueue, clientAppService);
    exchangeTracker.setSession('session-1');

    exchangeTracker.beginRequest(loopbackRequest());
    await nextTick();
    await nextTick();

    // 解析失败也要再推一次，否则 Renderer 会一直把它当成解析中，Application 筛选器里始终缺这一条。
    expect(recordingCaptureEventQueue.events).toHaveLength(2);
    expect(recordingCaptureEventQueue.events[0]?.summary.appPending).toBe(true);
    expect(recordingCaptureEventQueue.events[1]?.summary.appPending).toBeUndefined();
    expect(recordingExchangeCaptureService.exchanges[0]?.appId).toBeUndefined();
    expect(recordingExchangeCaptureService.exchanges[0]?.url).toBe('http://example.test/items');
  });

  it('carries a cached application on the first event without any lookup', async () => {
    let helperCalls = 0;
    const runner: ClientAppLookupRunner = async () => {
      helperCalls += 1;
      return '50000\t4242\tGoogle Chrome\tC:\\Chrome\\chrome.exe\n';
    };
    const clientAppService = new ClientAppService({ helperPath: 'helper.exe', runner });
    clientAppService.setProxyPort(8888);
    await clientAppService.resolveAppForPort(50_000);
    expect(helperCalls).toBe(1);

    const recordingCaptureEventQueue = new RecordingCaptureEventQueue();
    const exchangeTracker = new ExchangeTracker(new RecordingExchangeCaptureService(), recordingCaptureEventQueue, clientAppService);
    exchangeTracker.setSession('session-1');

    exchangeTracker.beginRequest(loopbackRequest());

    expect(recordingCaptureEventQueue.events).toHaveLength(1);
    expect(recordingCaptureEventQueue.events[0]?.summary.appName).toBe('Google Chrome');
    await nextTick();
    // 命中快照时既不再拉起 helper，也不产生多余的更新事件。
    expect(helperCalls).toBe(1);
    expect(recordingCaptureEventQueue.events).toHaveLength(1);
  });

  it('fills in the application through a follow-up update event', async () => {
    const runner: ClientAppLookupRunner = async () =>
      '50000\t4242\tGoogle Chrome\tC:\\Chrome\\chrome.exe\n';
    const clientAppService = new ClientAppService({ helperPath: 'helper.exe', runner });
    clientAppService.setProxyPort(8888);
    const recordingCaptureEventQueue = new RecordingCaptureEventQueue();
    const exchangeTracker = new ExchangeTracker(new RecordingExchangeCaptureService(), recordingCaptureEventQueue, clientAppService);
    exchangeTracker.setSession('session-1');

    exchangeTracker.beginRequest(loopbackRequest());
    expect(recordingCaptureEventQueue.events[0]?.summary.appName).toBeUndefined();

    await nextTick();
    await nextTick();

    expect(recordingCaptureEventQueue.events).toHaveLength(2);
    expect(recordingCaptureEventQueue.events[1]?.kind).toBe('exchange-updated');
    expect(recordingCaptureEventQueue.events[1]?.summary.appName).toBe('Google Chrome');
  });

  it('never looks up remote clients such as phones on the proxy', async () => {
    let helperCalls = 0;
    const runner: ClientAppLookupRunner = async () => {
      helperCalls += 1;
      return '';
    };
    const clientAppService = new ClientAppService({ helperPath: 'helper.exe', runner });
    clientAppService.setProxyPort(8888);
    const recordingCaptureEventQueue = new RecordingCaptureEventQueue();
    const exchangeTracker = new ExchangeTracker(new RecordingExchangeCaptureService(), recordingCaptureEventQueue, clientAppService);
    exchangeTracker.setSession('session-1');

    const request = {
      ...loopbackRequest(),
      remoteIpAddress: '192.168.1.42',
    } as InitiatedRequest;
    exchangeTracker.beginRequest(request);
    await nextTick();

    expect(recordingCaptureEventQueue.events).toHaveLength(1);
    expect(helperCalls).toBe(0);
  });
});
