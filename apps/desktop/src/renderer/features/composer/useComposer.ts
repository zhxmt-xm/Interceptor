import { buildSendHeaders, useComposerStore } from './composerStore';

/**
 * 发送当前 Composer 草稿：组装 method/url/headers(含 Auth)/body/protocol，经窄 API
 * 交给 Core 执行，成功/失败都写回视图状态（失败也进 response.error 展示）。
 */
export async function sendComposerRequest(): Promise<void> {
  const api = window.interceptor;
  const store = useComposerStore.getState();
  if (!api?.sendComposerRequest || store.sending) {
    return;
  }
  store.beginSend();
  try {
    const response = await api.sendComposerRequest({
      method: store.method,
      url: store.url,
      headers: buildSendHeaders(store),
      body: store.body.length > 0 ? store.body : undefined,
      protocol: store.protocol,
    });
    useComposerStore.getState().sendSucceeded(response);
  } catch (error) {
    useComposerStore
      .getState()
      .sendFailed(error instanceof Error ? error.message : String(error));
  }
}
