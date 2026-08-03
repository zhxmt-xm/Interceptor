import { useEffect, useRef, useState } from 'react';

import type { CaptureExchangeDetail } from '../../../../shared/desktop-api';
import { useCaptureStore } from './captureStore';

interface DetailState {
  detail: CaptureExchangeDetail | null;
  loading: boolean;
  error: string | null;
}

const IDLE: DetailState = { detail: null, loading: false, error: null };

/** 同一条 Exchange 连续更新时的最小重拉间隔；流式响应每块正文都会推一次事件。 */
const REFRESH_THROTTLE_MS = 300;

/**
 * 按选中行按需拉取单条 Exchange 详情（头部 + 正文引用）。
 *
 * 详情是每次选择的临时状态，保存在组件本地不进全局 store：完整 header/body 太重，
 * 全量常驻会吃爆 Renderer 内存，因此列表用轻量 summary、详情按需取。
 *
 * 选中的请求可能仍在进行中，响应头、trailer、规则效果、正文长度都会陆续到达，
 * 所以这里跟踪该条 summary 的引用变化而不是挑几个字段，再按固定间隔节流重拉。
 */
export function useExchangeDetail(exchangeId: string | null): DetailState {
  const [state, setState] = useState<DetailState>(IDLE);
  const summary = useCaptureStore((store) => {
    if (!exchangeId) {
      return undefined;
    }
    const position = store.indexById.get(exchangeId);
    return position === undefined ? undefined : store.rows[position];
  });
  const lastFetchedRef = useRef(0);

  useEffect(() => {
    if (!exchangeId) {
      setState(IDLE);
      return;
    }
    const api = window.interceptor;
    if (!api?.getExchangeDetail) {
      return;
    }
    let active = true;
    const fetchDetail = (): void => {
      lastFetchedRef.current = Date.now();
      // 重拉时保留已有详情，避免进行中的请求在面板上反复闪回加载态。
      setState((current) => (current.detail
        ? current
        : { detail: null, loading: true, error: null }));
      void api
        .getExchangeDetail(exchangeId)
        .then((detail) => {
          if (active) {
            setState({ detail, loading: false, error: null });
          }
        })
        .catch((error: unknown) => {
          if (active) {
            setState({
              detail: null,
              loading: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });
    };

    const elapsed = Date.now() - lastFetchedRef.current;
    if (elapsed >= REFRESH_THROTTLE_MS) {
      fetchDetail();
      return () => {
        active = false;
      };
    }
    const timer = window.setTimeout(fetchDetail, REFRESH_THROTTLE_MS - elapsed);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [exchangeId, summary]);

  return state;
}
