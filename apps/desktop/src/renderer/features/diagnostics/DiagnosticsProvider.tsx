import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { CoreDiagnosticRecord } from '../../../shared/desktop-api';

export type DiagnosticLevelFilter = CoreDiagnosticRecord['level'] | null;
export type DiagnosticProcessFilter = CoreDiagnosticRecord['process'] | null;
export type DiagnosticOutcomeFilter =
  | NonNullable<CoreDiagnosticRecord['outcome']>
  | null;

interface DiagnosticsContextValue {
  records: CoreDiagnosticRecord[];
  droppedCount: number;
  loading: boolean;
  selectedKey: string | null;
  setSelectedKey: (key: string | null) => void;
  refresh: () => void;
  processFilter: DiagnosticProcessFilter;
  levelFilter: DiagnosticLevelFilter;
  outcomeFilter: DiagnosticOutcomeFilter;
  cycleProcess: () => void;
  cycleLevel: () => void;
  cycleOutcome: () => void;
  exporting: boolean;
  exportError: string | null;
  exportJsonl: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
}

const DiagnosticsContext = createContext<DiagnosticsContextValue | null>(null);

const RECENT_LIMIT = 200;
const POLL_INTERVAL_MS = 2000;
const JOB_POLL_MS = 300;

const LEVEL_CYCLE: DiagnosticLevelFilter[] = [
  null,
  'error',
  'warn',
  'info',
  'debug',
];
const PROCESS_CYCLE: DiagnosticProcessFilter[] = [
  null,
  'core',
  'main',
  'renderer',
];
const OUTCOME_CYCLE: DiagnosticOutcomeFilter[] = [
  null,
  'success',
  'failed',
  'cancelled',
  'timed_out',
];

/**
 * Fetches recent Core diagnostics on an interval and shares them plus the
 * selected trace with the Diagnostics topbar, table and detail panes, which
 * live in separate AppShell grid areas.
 */
export function DiagnosticsProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [records, setRecords] = useState<CoreDiagnosticRecord[]>([]);
  const [droppedCount, setDroppedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [processFilter, setProcessFilter] =
    useState<DiagnosticProcessFilter>(null);
  const [levelFilter, setLevelFilter] = useState<DiagnosticLevelFilter>(null);
  const [outcomeFilter, setOutcomeFilter] =
    useState<DiagnosticOutcomeFilter>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const activeRef = useRef(true);

  const loadFirstPage = useCallback(
    (mode: 'reset' | 'merge') => {
      void window.interceptor
        ?.queryDiagnostics({
          limit: RECENT_LIMIT,
          ...(processFilter ? { process: processFilter } : {}),
          ...(levelFilter ? { level: levelFilter } : {}),
          ...(outcomeFilter ? { outcome: outcomeFilter } : {}),
        })
        .then((page) => {
          if (!activeRef.current) {
            return;
          }
          setDroppedCount(page.droppedCount);
          setLoading(false);
          if (mode === 'reset') {
            // 首次加载或过滤变化：整体替换为首页并重置分页游标。
            setRecords(page.records);
            setNextCursor(page.nextCursor);
            setHasMore(page.hasMore);
            return;
          }
          // 轮询：仅把新产生的记录按 sequence 去重后并入列表头部，保留用户经
          // “Load earlier records” 已加载的历史与分页游标，不整体替换。
          setRecords((current) => {
            const seen = new Set(current.map(diagnosticRecordKey));
            const fresh = page.records.filter(
              (record) => !seen.has(diagnosticRecordKey(record)),
            );
            return fresh.length ? [...fresh, ...current] : current;
          });
        })
        .catch(() => {
          if (activeRef.current) {
            setLoading(false);
          }
        });
    },
    [levelFilter, outcomeFilter, processFilter],
  );

  const refresh = useCallback(() => loadFirstPage('reset'), [loadFirstPage]);

  useEffect(() => {
    activeRef.current = true;
    // 过滤变化立即清空并重查首页；清空分页游标以在首页返回前禁用 loadMore。
    setRecords([]);
    setNextCursor(undefined);
    setHasMore(false);
    setLoading(true);
    loadFirstPage('reset');
    const timer = window.setInterval(
      () => loadFirstPage('merge'),
      POLL_INTERVAL_MS,
    );
    return () => {
      activeRef.current = false;
      window.clearInterval(timer);
    };
  }, [loadFirstPage]);

  const loadMore = useCallback(() => {
    const api = window.interceptor;
    if (!api || !nextCursor || !hasMore || loadingMore) {
      return;
    }
    setLoadingMore(true);
    void api
      .queryDiagnostics({
        cursor: nextCursor,
        limit: RECENT_LIMIT,
        ...(processFilter ? { process: processFilter } : {}),
        ...(levelFilter ? { level: levelFilter } : {}),
        ...(outcomeFilter ? { outcome: outcomeFilter } : {}),
      })
      .then((page) => {
        if (!activeRef.current) {
          return;
        }
        setRecords((current) => {
          const seen = new Set(current.map(diagnosticRecordKey));
          return [
            ...current,
            ...page.records.filter(
              (record) => !seen.has(diagnosticRecordKey(record)),
            ),
          ];
        });
        setDroppedCount(page.droppedCount);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
      })
      .finally(() => {
        if (activeRef.current) {
          setLoadingMore(false);
        }
      });
  }, [
    hasMore,
    levelFilter,
    loadingMore,
    nextCursor,
    outcomeFilter,
    processFilter,
  ]);

  const cycleProcess = useCallback(() => {
    setProcessFilter((current) => {
      const index = PROCESS_CYCLE.indexOf(current);
      return PROCESS_CYCLE[(index + 1) % PROCESS_CYCLE.length] ?? null;
    });
  }, []);

  const cycleLevel = useCallback(() => {
    setLevelFilter((current) => {
      const index = LEVEL_CYCLE.indexOf(current);
      return LEVEL_CYCLE[(index + 1) % LEVEL_CYCLE.length] ?? null;
    });
  }, []);

  const cycleOutcome = useCallback(() => {
    setOutcomeFilter((current) => {
      const index = OUTCOME_CYCLE.indexOf(current);
      return OUTCOME_CYCLE[(index + 1) % OUTCOME_CYCLE.length] ?? null;
    });
  }, []);

  const exportJsonl = useCallback(() => {
    const api = window.interceptor;
    if (!api || exporting) {
      return;
    }
    setExporting(true);
    setExportError(null);
    void api
      .startDiagnosticsExport({
        ...(processFilter ? { process: processFilter } : {}),
        ...(levelFilter ? { level: levelFilter } : {}),
        ...(outcomeFilter ? { outcome: outcomeFilter } : {}),
      })
      .then((job) => {
        if (!job) {
          setExporting(false);
          return;
        }
        const poll = (): void => {
          void api
            .getTransferJob(job.id)
            .then((next) => {
              if (!activeRef.current) {
                return;
              }
              if (!next || next.state === 'running') {
                if (next) {
                  window.setTimeout(poll, JOB_POLL_MS);
                  return;
                }
              }
              if (next && next.state === 'failed') {
                setExportError(next.message ?? 'Diagnostics export failed.');
              }
              setExporting(false);
            })
            .catch((reason: unknown) => {
              if (activeRef.current) {
                setExportError(
                  reason instanceof Error ? reason.message : String(reason),
                );
                setExporting(false);
              }
            });
        };
        window.setTimeout(poll, JOB_POLL_MS);
      })
      .catch((reason: unknown) => {
        setExportError(
          reason instanceof Error ? reason.message : String(reason),
        );
        setExporting(false);
      });
  }, [exporting, levelFilter, outcomeFilter, processFilter]);

  const value: DiagnosticsContextValue = {
    records,
    droppedCount,
    loading,
    selectedKey,
    setSelectedKey,
    refresh,
    processFilter,
    levelFilter,
    outcomeFilter,
    cycleProcess,
    cycleLevel,
    cycleOutcome,
    exporting,
    exportError,
    exportJsonl,
    hasMore,
    loadingMore,
    loadMore,
  };

  return (
    <DiagnosticsContext.Provider value={value}>
      {children}
    </DiagnosticsContext.Provider>
  );
}

export function useDiagnostics(): DiagnosticsContextValue {
  const value = useContext(DiagnosticsContext);
  if (!value) {
    throw new Error('useDiagnostics must be used within a DiagnosticsProvider');
  }
  return value;
}

function diagnosticRecordKey(record: CoreDiagnosticRecord): string {
  return `${record.process}:${record.timestamp}:${record.sequence}`;
}
