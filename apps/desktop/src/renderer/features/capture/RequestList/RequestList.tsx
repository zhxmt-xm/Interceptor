import { useVirtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CaptureExchangeSummary, RuleActionType } from '../../../../shared/desktop-api';
import type { BreakpointScope } from '../../rules/interfaces';
import {
  RequestContextMenu,
  type RequestContextMenuTarget,
} from '../RequestContextMenu/RequestContextMenu';
import { useCaptureStore } from '../data/captureStore';
import { RequestRow } from '../RequestRow/RequestRow';
import { isScrolledToBottom, visibleCaptureRows } from '../utils';
import styles from './RequestList.module.css';

const ROW_HEIGHT = 52;

export interface RequestListProps {
  onCreateRequestRule: (
    summary: CaptureExchangeSummary,
    actionType: RuleActionType,
    name: string,
  ) => void;
  onCreateBreakpoint: (
    summary: CaptureExchangeSummary,
    scope: BreakpointScope | 'custom',
    name: string,
  ) => void;
}

/** 虚拟化请求表格：表头 + 行；命令与筛选都在列表工具栏与筛选分栏里。 */
export function RequestList({
  onCreateRequestRule,
  onCreateBreakpoint,
}: RequestListProps): React.JSX.Element {
  const { t } = useTranslation();
  const rows = useCaptureStore((state) => state.rows);
  const filter = useCaptureStore((state) => state.filter);
  const selectedId = useCaptureStore((state) => state.selectedId);
  const select = useCaptureStore((state) => state.select);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  const [contextMenuTarget, setContextMenuTarget] = useState<RequestContextMenuTarget | null>(null);
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
    if (!element) {
      return;
    }
    const measure = (): void => {
      setScrollbarWidth(element.offsetWidth - element.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = parentRef.current;
    if (element) {
      element.scrollTop = initialScrollTopRef.current;
      stickToBottomRef.current = isScrolledToBottom(element, ROW_HEIGHT);
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
    stickToBottomRef.current = isScrolledToBottom(element, ROW_HEIGHT);
    useCaptureStore.getState().setListScrollTop(element.scrollTop);
  };

  return (
    <RequestContextMenu
      target={contextMenuTarget}
      onClose={() => setContextMenuTarget(null)}
      onCreateRule={onCreateRequestRule}
      onCreateBreakpoint={onCreateBreakpoint}
    >
      <div className={styles.list}>
      <div
        className={styles.head}
        style={{ paddingRight: 14 + scrollbarWidth }}
      >
        <span data-parity="capture-list-app-header" />
        <span>{t('capture.method')}</span>
        <span>{t('capture.pathHost')}</span>
        <span data-parity="capture-list-status-header">{t('capture.status')}</span>
        <span data-parity="capture-list-proto-header">{t('capture.protocolShort')}</span>
        <span data-parity="capture-list-type-header">{t('capture.type')}</span>
        <span data-parity="capture-list-size-header">{t('capture.size')}</span>
        <span data-parity="capture-list-time-header">{t('capture.time')}</span>
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
                  onOpenContextMenu={(summary) => {
                    setContextMenuTarget({ summary });
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
      </div>
    </RequestContextMenu>
  );
}

