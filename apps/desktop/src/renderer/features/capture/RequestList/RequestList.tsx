import { useVirtualizer } from '@tanstack/react-virtual';
import { Ampersand, Trash2 } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Count, cx, IconButton, Segmented } from '../../../components';
import { useCaptureStore } from '../data/captureStore';
import type { ProtocolSegment } from '../interfaces';
import { RequestRow } from '../RequestRow/RequestRow';
import { visibleCaptureRows } from '../utils';
import styles from './RequestList.module.css';

const SEGMENTS: { id: ProtocolSegment; labelKey?: string; label?: string }[] = [
  { id: 'all', labelKey: 'capture.all' },
  { id: 'h1', label: 'H1' },
  { id: 'h2', label: 'H2' },
  { id: 'ws', label: 'WS' },
];
const ROW_HEIGHT = 52;

/** 判断滚动容器是否已停靠在底部（容差一行高）。 */
function isScrolledToBottom(element: HTMLDivElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= ROW_HEIGHT;
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
  const showQueryParams = useCaptureStore((state) => state.showQueryParams);
  const toggleQueryParams = useCaptureStore((state) => state.toggleQueryParams);
  const [clearing, setClearing] = useState(false);
  const initialScrollTopRef = useRef(useCaptureStore.getState().listScrollTop);
  // 用户是否停靠在底部（最新）；新流量到达时决定是否自动跟随到底部。
  const stickToBottomRef = useRef(true);

  const visible = useMemo(() => visibleCaptureRows(rows, filter), [rows, filter]);

  const parentRef = useRef<HTMLDivElement>(null);
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
      stickToBottomRef.current = isScrolledToBottom(element);
    }
  }, []);

  // 列表按时间升序（最新在底部）；用户仍停靠底部时随新流量自动跟随，保持最新可见。
  useLayoutEffect(() => {
    const element = parentRef.current;
    if (element && stickToBottomRef.current) {
      element.scrollTop = element.scrollHeight;
      useCaptureStore.getState().setListScrollTop(element.scrollTop);
    }
  }, [visible.length]);

  const handleScroll = (): void => {
    const element = parentRef.current;
    if (!element) {
      return;
    }
    stickToBottomRef.current = isScrolledToBottom(element);
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
        <Segmented
          className={styles.protocol}
          ariaLabel={t('capture.protocolShort')}
          options={SEGMENTS.map(({ id, labelKey, label }) => ({
            value: id,
            label: labelKey ? t(labelKey) : label ?? id,
          }))}
          value={filter.segment}
          onChange={(value) => setSegment(value as ProtocolSegment)}
          automationIds={AUTOMATION_IDS.capture.protocol}
        />
        <span className={styles.spacer} />
        <Count className={styles.count}>
          {t('capture.visibleCount', { visible: visible.length, total: rows.length })}
        </Count>
        <div className={styles.actions}>
          <IconButton
            icon={Ampersand}
            label={t('capture.queryParams')}
            size="sm"
            className={cx(styles.queryParams, showQueryParams && styles.queryParamsOn)}
            onClick={toggleQueryParams}
            automationId={AUTOMATION_IDS.capture.queryParams}
          />
          <IconButton
            icon={Trash2}
            label={t('capture.clear')}
            size="sm"
            disabled={clearing}
            onClick={clearRecordedTraffic}
            automationId={AUTOMATION_IDS.capture.clear}
          />
        </div>
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
                  offsetTop={virtualRow.start}
                  onSelect={(id) => select(id === selectedId ? null : id)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

