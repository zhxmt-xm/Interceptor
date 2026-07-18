import { useVirtualizer } from '@tanstack/react-virtual';
import { Columns2, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Count, cx, IconButton } from '../../../components';
import { matchesSegment, useCaptureStore } from '../captureStore';
import type { ProtocolSegment } from '../row-format';
import { RequestRow } from '../RequestRow/RequestRow';
import { loadMoreSessions } from '../useCaptureData';
import styles from './RequestList.module.css';

const SEGMENTS: { id: ProtocolSegment; labelKey?: string; label?: string }[] = [
  { id: 'all', labelKey: 'capture.all' },
  { id: 'h1', label: 'H1' },
  { id: 'h2', label: 'H2' },
  { id: 'ws', label: 'WS' },
];
const ROW_HEIGHT = 52;

/** Filterable request table (protocol segment, counts and virtualized rows). */
export function RequestList(): React.JSX.Element {
  const { t } = useTranslation();
  const rows = useCaptureStore((state) => state.rows);
  const segment = useCaptureStore((state) => state.filter.segment);
  const selectedId = useCaptureStore((state) => state.selectedId);
  const hasMore = useCaptureStore((state) => state.hasMore);
  const setSegment = useCaptureStore((state) => state.setSegment);
  const select = useCaptureStore((state) => state.select);
  const clearView = useCaptureStore((state) => state.clearView);

  const visible =
    segment === 'all' ? rows : rows.filter((row) => matchesSegment(row, segment));

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const handleScroll = (): void => {
    const element = parentRef.current;
    if (!element || !hasMore) {
      return;
    }
    const distanceToBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceToBottom < ROW_HEIGHT * 8) {
      void loadMoreSessions();
    }
  };

  return (
    <div className={styles.list}>
      <div className={styles.bar}>
        <div className={styles.segmented}>
          {SEGMENTS.map(({ id, labelKey, label }) => (
            <span
              key={id}
              className={cx(segment === id && styles.active)}
              onClick={() => setSegment(id)}
            >
              {labelKey ? t(labelKey) : label}
            </span>
          ))}
        </div>
        <span className={styles.spacer} />
        <Count>
          {t('capture.visibleCount', { visible: visible.length, total: rows.length })}
        </Count>
        <IconButton icon={Columns2} label={t('capture.columns')} size="sm" />
        <IconButton icon={Trash2} label={t('capture.clear')} size="sm" onClick={clearView} />
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

