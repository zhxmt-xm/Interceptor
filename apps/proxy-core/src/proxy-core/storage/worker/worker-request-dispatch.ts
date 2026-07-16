import type { CaptureStore } from './worker-store';
import type { StorageWorkerRequest } from '../protocol';

/**
 * 将一条 Storage Worker 请求分派到 CaptureStore 的对应同步操作。
 *
 * 抽成独立函数后，Storage Worker 入口逐条同步处理主线程请求时复用同一分派逻辑。
 * 未知 kind 通过穷尽检查在编译期暴露，运行期则抛错并由调用方转为 error 响应。
 */
export function applyStorageRequest(
  store: CaptureStore,
  request: StorageWorkerRequest,
): unknown {
  switch (request.kind) {
    case 'ensure-session':
      store.ensureSession(request.session);
      return undefined;
    case 'append-exchanges':
      return store.appendExchanges(request.exchanges);
    case 'update-exchange':
      store.updateExchangeResponse(request.patch);
      return undefined;
    case 'query-sessions':
      return store.querySessions(request.query);
    case 'exchange-detail':
      return store.getExchangeDetail(request.exchangeId);
    case 'storage-status':
      return store.getStorageStats();
    case 'cleanup':
      return store.cleanup(request.scope);
    case 'referenced-hashes':
      return store.referencedBlobHashes();
    case 'save-rule-set':
      return store.saveRuleSet(request.expectedRevision, request.rules);
    case 'load-rule-set':
      return store.loadRuleSet();
    case 'append-rule-hits':
      store.appendRuleHits(request.exchangeId, request.hits);
      return undefined;
    case 'count-rule-hits':
      return store.countRuleHits();
    case 'close':
      store.close();
      return undefined;
    default: {
      const exhaustive: never = request;
      throw new Error(
        `Unknown storage worker request: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}
