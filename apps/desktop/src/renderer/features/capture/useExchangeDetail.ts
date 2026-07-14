import { useEffect, useState } from 'react';

import type { CaptureExchangeDetail } from '../../../shared/desktop-api';

interface DetailState {
  detail: CaptureExchangeDetail | null;
  loading: boolean;
  error: string | null;
}

const IDLE: DetailState = { detail: null, loading: false, error: null };

/**
 * 按选中行按需拉取单条 Exchange 详情（头部 + 正文引用）。
 * 详情为每次选择的临时状态，保存在组件本地，不进入全局 store（正文更不入全局）。
 */
export function useExchangeDetail(exchangeId: string | null): DetailState {
  const [state, setState] = useState<DetailState>(IDLE);

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
    setState({ detail: null, loading: true, error: null });
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
    return () => {
      active = false;
    };
  }, [exchangeId]);

  return state;
}
