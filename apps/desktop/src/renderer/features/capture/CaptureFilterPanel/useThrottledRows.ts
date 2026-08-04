import { useEffect, useRef, useState } from 'react';

import type { CaptureExchangeSummary } from '../../../../shared/desktop-api';
import { useCaptureStore } from '../data/captureStore';

/** 按固定间隔取一次列表快照；首次与空闲时立即生效，高频时最多滞后一个间隔。 */
export function useThrottledRows(intervalMs: number): CaptureExchangeSummary[] {
  const rows = useCaptureStore((state) => state.rows);
  const [snapshot, setSnapshot] = useState(rows);
  const lastAppliedRef = useRef(0);

  useEffect(() => {
    const elapsed = Date.now() - lastAppliedRef.current;
    if (elapsed >= intervalMs) {
      lastAppliedRef.current = Date.now();
      setSnapshot(rows);
      return;
    }
    const timer = window.setTimeout(() => {
      lastAppliedRef.current = Date.now();
      setSnapshot(rows);
    }, intervalMs - elapsed);
    return () => window.clearTimeout(timer);
  }, [rows, intervalMs]);

  return snapshot;
}
