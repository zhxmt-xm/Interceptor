import { useVirtualizer } from '@tanstack/react-virtual';
import { Columns2, Trash2 } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Count, cx, IconButton } from '../../../components';
import { useCaptureStore, visibleCaptureRows } from '../captureStore';
import type { ProtocolSegment } from '../row-format';
import { RequestRow } from '../RequestRow/RequestRow';
import styles from './RequestList.module.css';

const SEGMENTS: { id: ProtocolSegment; labelKey?: string; label?: string }[] = [
  { id: 'all', labelKey: 'capture.all' },
  { id: 'h1', label: 'H1' },
  { id: 'h2', label: 'H2' },
  { id: 'ws', label: 'WS' },
];
const ROW_HEIGHT = 52;

interface SelectedPosition {
  id: string;
  index: number;
}

/** Filterable request table (protocol segment, counts and virtualized rows). */
export function RequestList(): React.JSX.Element {
  const { t } = useTranslation();
  const rows = useCaptureStore((state) => state.rows);
  const filter = useCaptureStore((state) => state.filter);
  const selectedId = useCaptureStore((state) => state.selectedId);
  const setSegment = useCaptureStore((state) => state.setSegment);
  const select = useCaptureStore((state) => state.select);
  const clearView = useCaptureStore((state) => state.clearView);
  const [clearing, setClearing] = useState(false);
  const initialScrollTopRef = useRef(useCaptureStore.getState().listScrollTop);

  const visible = visibleCaptureRows(rows, filter);

  const parentRef = useRef<HTMLDivElement>(null);
  const selectedPositionRef = useRef<SelectedPosition | null>(null);
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    initialOffset: initialScrollTopRef.current,
  });

  useLayoutEffect(() => {
    const element = parentRef.current;
    if (element) {
      element.scrollTop = initialScrollTopRef.current;
    }
  }, []);

  useLayoutEffect(() => {
    const nextSelectedIndex = selectedId
      ? visible.findIndex((row) => row.id === selectedId)
      : -1;
    const previousPosition = selectedPositionRef.current;
    const element = parentRef.current;
    if (
      element
      && selectedId
      && previousPosition?.id === selectedId
      && nextSelectedIndex >= 0
      && nextSelectedIndex !== previousPosition.index
    ) {
      element.scrollTop += (nextSelectedIndex - previousPosition.index) * ROW_HEIGHT;
      useCaptureStore.getState().setListScrollTop(element.scrollTop);
    }
    selectedPositionRef.current = selectedId && nextSelectedIndex >= 0
      ? { id: selectedId, index: nextSelectedIndex }
      : null;
  }, [selectedId, visible]);

  const handleScroll = (): void => {
    const element = parentRef.current;
    if (!element) {
      return;
    }
    useCaptureStore.getState().setListScrollTop(element.scrollTop);
  };

  const clearRecordedTraffic = (): void => {
    if (clearing) {
      return;
    }
    const clearedBefore = Date.now();
    setClearing(true);
    void window.interceptor.clearStorage()
      .then(() => clearView(clearedBefore))
      .catch((error: unknown) => {
        useCaptureStore.getState().loadFailed(
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => setClearing(false));
  };

  return (
    <div className={styles.list}>
      <div className={styles.bar}>
        <div className={styles.segmented}>
          {SEGMENTS.map(({ id, labelKey, label }) => (
            <span
              key={id}
              className={cx(filter.segment === id && styles.active)}
              onClick={() => setSegment(id)}
            >
              {labelKey ? t(labelKey) : label}
            </span>
          ))}
        </div>
        <span className={styles.spacer} />
        <Count className={styles.count}>
          {t('capture.visibleCount', { visible: visible.length, total: rows.length })}
        </Count>
        <IconButton
          icon={Columns2}
          label={t('capture.columns')}
          size="sm"
          className={styles.columns}
        />
        <IconButton
          icon={Trash2}
          label={t('capture.clear')}
          size="sm"
          disabled={clearing}
          onClick={clearRecordedTraffic}
        />
      </div>

      <div className={styles.head}>
        <span>{t('capture.method')}</span>
        <span>{t('capture.hostPath')}</span>
        <span>{t('capture.status')}</span>
        <span>{t('capture.protocolShort')}</span>
        <span>{t('capture.type')}</span>
        <span>{t('capture.size')}</span>
        <span>{t('capture.time')}</span>
      </div>

      <div className={styles.scroll} ref={parentRef} onScroll={handleScroll}>
        {visible.length === 0 ? (
          <div className={styles.empty}>{t('capture.emptyRequests')}</div>
        ) : (
          <div
            className={styles.viewport}
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = visible[virtualRow.index];
              if (!row) {
                return null;
              }
              return (
                <RequestRow
                  key={row.id}
                  summary={row}
                  selected={row.id === selectedId}
                  onSelect={() => select(row.id)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

