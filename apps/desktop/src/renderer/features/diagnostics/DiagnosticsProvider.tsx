import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { CoreDiagnosticRecord } from '../../../shared/desktop-api';

interface DiagnosticsContextValue {
  records: CoreDiagnosticRecord[];
  droppedCount: number;
  loading: boolean;
  selectedKey: string | null;
  setSelectedKey: (key: string | null) => void;
  refresh: () => void;
}

const DiagnosticsContext = createContext<DiagnosticsContextValue | null>(null);

const RECENT_LIMIT = 200;
const POLL_INTERVAL_MS = 2000;

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
  const activeRef = useRef(true);

  const refresh = useCallback(() => {
    void window.interceptor
      ?.getRecentDiagnostics(RECENT_LIMIT)
      .then((snapshot) => {
        if (!activeRef.current) {
          return;
        }
        setRecords(snapshot.records);
        setDroppedCount(snapshot.droppedCount);
        setLoading(false);
      })
      .catch(() => {
        if (activeRef.current) {
          setLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    activeRef.current = true;
    refresh();
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      activeRef.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  const value: DiagnosticsContextValue = {
    records,
    droppedCount,
    loading,
    selectedKey,
    setSelectedKey,
    refresh,
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
