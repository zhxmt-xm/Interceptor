import { useEffect, useRef, useState } from 'react';

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
  const cursorRef = useRef<string | undefined>(undefined);
  const hasMoreRef = useRef(false);
  const busyRef = useRef(false);

  useEffect(() => {
    let active = true;
    setPage(null);
    setMessages([]);
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    cursorRef.current = undefined;
    hasMoreRef.current = false;
    busyRef.current = true;
    void window.interceptor
      .queryGrpcMessages({ exchangeId, side, limit: PAGE_SIZE })
      .then((result) => {
        if (!active) {
          return;
        }
        const { items, ...metadata } = result;
        setPage(metadata);
        setMessages(items);
        cursorRef.current = result.nextCursor;
        hasMoreRef.current = result.hasMore;
        busyRef.current = false;
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
          busyRef.current = false;
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [exchangeId, side]);

  const loadMore = (): void => {
    if (!hasMoreRef.current || busyRef.current) {
      return;
    }
    busyRef.current = true;
    setLoadingMore(true);
    void window.interceptor
      .queryGrpcMessages({
        exchangeId,
        side,
        cursor: cursorRef.current,
        limit: PAGE_SIZE,
      })
      .then((result) => {
        const { items, ...metadata } = result;
        setPage(metadata);
        setMessages((current) => [...current, ...items]);
        cursorRef.current = result.nextCursor;
        hasMoreRef.current = result.hasMore;
        busyRef.current = false;
        setLoadingMore(false);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
        busyRef.current = false;
        setLoadingMore(false);
      });
  };

  return { page, messages, loading, loadingMore, error, loadMore };
}