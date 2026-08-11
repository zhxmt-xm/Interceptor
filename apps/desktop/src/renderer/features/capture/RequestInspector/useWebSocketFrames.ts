import { useEffect, useRef, useState } from 'react';

import type {
  WebSocketBreakpointSettings,
  WebSocketFrameDirection,
  WebSocketFrameSummary,
} from '../../../../shared/desktop-api';

const PAGE_SIZE = 100;
const POLL_INTERVAL_MS = 2_000;

interface WebSocketFramesState {
  frames: WebSocketFrameSummary[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  /** 当前连接的断点配置；null 表示未启用。 */
  breakpoint: WebSocketBreakpointSettings | null;
  error: string | null;
  loadMore(): void;
  enableBreakpoints(settings: WebSocketBreakpointSettings): void;
  disableBreakpoints(): void;
}

/** 有限 keyset 分页 + 尾游标轮询；payload 字节不进入此状态。 */
export function useWebSocketFrames(
  exchangeId: string,
  direction: WebSocketFrameDirection | undefined,
): WebSocketFramesState {
  const [frames, setFrames] = useState<WebSocketFrameSummary[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [breakpoint, setBreakpoint] = useState<WebSocketBreakpointSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | undefined>(undefined);
  const hasMoreRef = useRef(false);
  const busyRef = useRef(false);

  useEffect(() => {
    let active = true;
    setFrames([]);
    setCursor(undefined);
    setLoading(true);
    setLoadingMore(false);
    setHasMore(false);
    hasMoreRef.current = false;
    cursorRef.current = undefined;
    busyRef.current = true;
    setError(null);
    const api = window.interceptor;
    if (!api?.queryWebSocketFrames) {
      setLoading(false);
      busyRef.current = false;
      return;
    }
    void api
      .queryWebSocketFrames({ exchangeId, limit: PAGE_SIZE, direction })
      .then((page) => {
        if (!active) {
          return;
        }
        setFrames(page.items);
        setCursor(page.nextCursor);
        cursorRef.current = page.nextCursor;
        setHasMore(page.hasMore);
        hasMoreRef.current = page.hasMore;
        setBreakpoint(page.breakpoint);
        setLoading(false);
        busyRef.current = false;
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
          setLoading(false);
          busyRef.current = false;
        }
      });
    return () => {
      active = false;
    };
  }, [exchangeId, direction]);

  const loadMore = (): void => {
    if (!hasMoreRef.current || busyRef.current) {
      return;
    }
    busyRef.current = true;
    setLoadingMore(true);
    const api = window.interceptor;
    if (!api?.queryWebSocketFrames) {
      busyRef.current = false;
      setLoadingMore(false);
      return;
    }
    void api
      .queryWebSocketFrames({
        exchangeId,
        cursor: cursorRef.current,
        limit: PAGE_SIZE,
        direction,
      })
      .then((page) => {
        setFrames((current) => mergeFrames(current, page.items));
        cursorRef.current = page.nextCursor;
        setHasMore(page.hasMore);
        hasMoreRef.current = page.hasMore;
        setBreakpoint(page.breakpoint);
        setLoadingMore(false);
        busyRef.current = false;
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
        setLoadingMore(false);
        busyRef.current = false;
      });
  };

  useEffect(() => {
    let active = true;
    const poll = (): void => {
      if (hasMoreRef.current || busyRef.current) {
        return;
      }
      const api = window.interceptor;
      if (!api?.queryWebSocketFrames) {
        return;
      }
      busyRef.current = true;
      void api
        .queryWebSocketFrames({
          exchangeId,
          cursor: cursorRef.current,
          limit: PAGE_SIZE,
          direction,
        })
        .then((page) => {
          if (!active) {
            return;
          }
          if (page.items.length > 0) {
            setFrames((current) => mergeFrames(current, page.items));
          }
          cursorRef.current = page.nextCursor;
          setHasMore(page.hasMore);
          hasMoreRef.current = page.hasMore;
          setBreakpoint(page.breakpoint);
          busyRef.current = false;
        })
        .catch(() => {
          // Core 重启或连接切换时保持已有消息，下一轮自动恢复。
          busyRef.current = false;
        });
    };
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [direction, exchangeId]);

  const enableBreakpoints = (settings: WebSocketBreakpointSettings): void => {
    const api = window.interceptor;
    if (!api?.enableWebSocketBreakpoints) {
      return;
    }
    void api.enableWebSocketBreakpoints(settings).then(setBreakpoint, () => undefined);
  };

  const disableBreakpoints = (): void => {
    const api = window.interceptor;
    if (!api?.disableWebSocketBreakpoints) {
      return;
    }
    void api.disableWebSocketBreakpoints().then(setBreakpoint, () => undefined);
  };

  return {
    frames,
    loading,
    loadingMore,
    hasMore,
    breakpoint,
    error,
    loadMore,
    enableBreakpoints,
    disableBreakpoints,
  };
}

function mergeFrames(
  current: WebSocketFrameSummary[],
  incoming: WebSocketFrameSummary[],
): WebSocketFrameSummary[] {
  if (incoming.length === 0) {
    return current;
  }
  const bySequence = new Map(current.map((frame) => [frame.seq, frame]));
  for (const frame of incoming) {
    bySequence.set(frame.seq, frame);
  }
  return [...bySequence.values()].sort((left, right) => left.seq - right.seq);
}