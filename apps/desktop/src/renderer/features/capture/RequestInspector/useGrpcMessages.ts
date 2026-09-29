import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  GrpcMessagePage,
  GrpcMessageSide,
  GrpcMessageSummary,
} from '../../../../shared/desktop-api';

const PAGE_SIZE = 100;

interface GrpcMessagesState {
  page: Omit<GrpcMessagePage, 'items'> | null;
  messages: GrpcMessageSummary[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMore(): void;
}

export function useGrpcMessages(
  exchangeId: string,
  side: GrpcMessageSide,
): GrpcMessagesState {
  const [page, setPage] = useState<Omit<GrpcMessagePage, 'items'> | null>(null);
  const [messages, setMessages] = useState<GrpcMessageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadMoreRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let active = true;
    let busy = false;
    let cursor: string | undefined;
    let hasMore = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setPage(null);
    setMessages([]);
    setLoading(true);
    setLoadingMore(false);
    setError(null);

    const load = async (append: boolean): Promise<void> => {
      if (!active || busy) return;
      busy = true;
      if (append && hasMore) setLoadingMore(true);
      try {
        const result = await window.interceptor.queryGrpcMessages({ exchangeId, side, cursor, limit: PAGE_SIZE });
        if (!active) return;
        const { items, ...metadata } = result;
        setPage(metadata);
        setMessages((current) => append ? [...current, ...items] : items);
        cursor = result.nextCursor;
        hasMore = result.hasMore;
        if (!result.bodyComplete && !hasMore && result.malformedOffset === undefined) {
          timer = setTimeout(() => void load(true), 350);
        }
      } catch (loadError: unknown) {
        if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (active) {
          busy = false;
          setLoading(false);
          setLoadingMore(false);
        }
      }
    };
    loadMoreRef.current = () => {
      if (hasMore) void load(true);
    };
    void load(false);
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
      loadMoreRef.current = null;
    };
  }, [exchangeId, side]);

  const loadMore = useCallback((): void => {
    loadMoreRef.current?.();
  }, []);

  return { page, messages, loading, loadingMore, error, loadMore };
}