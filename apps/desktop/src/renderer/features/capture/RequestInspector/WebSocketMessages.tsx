import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowRight, ListOrdered, Pause } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  PendingBreakpoint,
  WebSocketFrameDirection,
  WebSocketFrameSummary,
} from '../../../../shared/desktop-api';
import { BODY_PREVIEW_MAX_BYTES } from '../../../../shared/desktop-api';
import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../shared/automation-ids';
import { cx, Segmented, sizeLabel } from '../../../components';
import { useBreakpointsStore } from '../../breakpoints';
import {
  breakpointBodyBytes,
  breakpointQueuePosition,
} from '../../breakpoints/utils';
import { WebSocketBreakpointInspector } from '../BreakpointInspector/WebSocketBreakpointInspector';
import {
  filterDirection,
  frameRelativeTime,
  webSocketTimelineItems,
} from '../utils';
import { WebSocketBreakpointControl } from '../WebSocketBreakpointControl/WebSocketBreakpointControl';
import { FramePayload } from './FramePayload';
import { FramePreview } from './FramePreview';
import { useWebSocketFrames } from './useWebSocketFrames';
import styles from './WebSocketMessages.module.css';
import { readCompleteBody } from '../data/readCompleteBody';

const ROW_HEIGHT = 38;
type DirectionFilter = 'all' | 'sent' | 'received';

interface WebSocketMessagesProps {
  exchangeId: string;
  startedAt: number;
  /** Connection address shown in the breakpoint setup panel. */
  connection: string;
  /** Frames currently held by Core before forwarding, in logical queue order. */
  pausedBreakpoints: readonly PendingBreakpoint[];
}

export function WebSocketMessages({
  exchangeId,
  startedAt,
  connection,
  pausedBreakpoints,
}: WebSocketMessagesProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const [filter, setFilter] = useState<DirectionFilter>('all');
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);
  const selectedBreakpointId = useBreakpointsStore((state) => state.selectedId);
  const selectBreakpoint = useBreakpointsStore((state) => state.select);
  const direction = filterDirection(filter);
  const {
    frames,
    loading,
    loadingMore,
    hasMore,
    breakpoint,
    error,
    loadMore,
    enableBreakpoints,
    disableBreakpoints,
  } =
    useWebSocketFrames(exchangeId, direction);
  const timelineItems = webSocketTimelineItems(frames, pausedBreakpoints, direction);
  const visiblePendingBreakpoints = pausedBreakpoints.filter((pending) =>
    direction === undefined || pending.direction === direction);
  const queueHead = pausedBreakpoints[0] ?? null;
  const selectedPending = visiblePendingBreakpoints.find(
    (pending) => pending.id === selectedBreakpointId,
  ) ?? visiblePendingBreakpoints[0] ?? null;
  const selectedPendingPosition = selectedPending
    ? breakpointQueuePosition(pausedBreakpoints, selectedPending)
    : null;
  const selectedPendingIsHead = selectedPending?.id === queueHead?.id;
  const pendingKey = pausedBreakpoints.map((pending) => pending.id).join('|');
  const timelineKey = timelineItems.map((item) =>
    item.kind === 'history' ? `frame:${item.frame.seq}` : `pending:${item.breakpoint.id}`)
    .join('|');
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: timelineItems.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => {
      const item = timelineItems[index];
      return item?.kind === 'history'
        ? `frame:${item.frame.seq}`
        : `pending:${item?.breakpoint.id ?? index}`;
    },
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  useEffect(() => {
    setSelectedSequence(null);
  }, [exchangeId, filter, pendingKey]);

  useEffect(() => {
    virtualizer.measure();
  }, [selectedSequence, timelineKey, virtualizer]);

  const handleScroll = (): void => {
    const element = scrollRef.current;
    if (!element || !hasMore || loadingMore) {
      return;
    }
    if (element.scrollHeight - element.scrollTop - element.clientHeight < ROW_HEIGHT * 6) {
      loadMore();
    }
  };

  const handleSelectFrame = useCallback((seq: number): void => {
    setSelectedSequence((current) => (current === seq ? null : seq));
  }, []);

  return (
    <div className={styles.messages}>
      <div className={styles.toolbar}>
        <Segmented
          options={[
            { value: 'all', label: t('capture.all') },
            { value: 'sent', label: t('capture.sent') },
            { value: 'received', label: t('capture.received') },
          ]}
          value={filter}
          onChange={(value) => setFilter(value as DirectionFilter)}
          automationIds={{
            all: AUTOMATION_IDS.capture.websocket.directionAll,
            sent: AUTOMATION_IDS.capture.websocket.directionSent,
            received: AUTOMATION_IDS.capture.websocket.directionReceived,
          }}
        />
        <span className={styles.spacer} />
        <WebSocketBreakpointControl
          exchangeId={exchangeId}
          connection={connection}
          breakpoint={breakpoint}
          onEnable={enableBreakpoints}
          onDisable={disableBreakpoints}
        />
      </div>

      <div className={cx(styles.frameList, selectedPending && selectedPendingIsHead && styles.pausedFrameList,
        selectedPending && !selectedPendingIsHead && styles.queuedFrameList)}>
        <div className={styles.frameScroll} ref={scrollRef} onScroll={handleScroll}>
          {loading ? <div className={styles.empty} data-parity="websocket-message-state">{t('capture.loadingMessages')}</div> : null}
          {!loading && error ? (
            <div className={styles.empty} data-parity="websocket-message-state">{t('capture.failedLoadMessages', { error })}</div>
          ) : null}
          {!loading && !error && timelineItems.length === 0 ? (
            <div className={styles.empty} data-parity="websocket-message-state">{t('capture.noWebSocketMessages')}</div>
          ) : null}
          {timelineItems.length > 0 ? (
            <div className={styles.viewport} style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const item = timelineItems[virtualRow.index];
                if (!item) {
                  return null;
                }
                if (item.kind === 'pending') {
                  const pending = item.breakpoint;
                  const position = breakpointQueuePosition(pausedBreakpoints, pending);
                  const queued = pending.id !== queueHead?.id;
                  const bodyBytes = breakpointBodyBytes(pending.body ?? '', pending.bodyFormat);
                  const kind = pending.frame && pending.frame !== 'message'
                    ? pending.frame.charAt(0).toUpperCase() + pending.frame.slice(1)
                    : pending.opcode === 2
                      ? t('capture.binary')
                      : t('breakpoints.replacementText');
                  return (
                    <div
                      key={pending.id}
                      ref={virtualizer.measureElement}
                      data-index={virtualRow.index}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <button
                        type="button"
                        className={cx(
                          styles.frame,
                          queued ? styles.queuedFrame : styles.pausedFrame,
                          pending.id === selectedPending?.id && styles.selected,
                        )}
                        aria-pressed={pending.id === selectedPending?.id}
                        data-automation-id={AutomationIdFactory.breakpointPending(pending.id)}
                        data-breakpoint-id={pending.id}
                        data-queue-key={pending.queueKey}
                        data-queue-position={position ?? undefined}
                        data-breakpoint-state={queued ? 'queued' : 'head'}
                        onClick={() => {
                          setSelectedSequence(null);
                          selectBreakpoint(pending.id);
                        }}
                      >
                        <span className={cx(
                          styles.direction,
                          pending.direction === 'client-to-server'
                            ? styles.outgoing
                            : styles.incoming,
                        )}>
                          <ArrowRight size={12} strokeWidth={1.9} />
                        </span>
                        <span className={styles.kind}>{kind}</span>
                        <span className={styles.preview}>
                          {(pending.body ?? '').replace(/\s+/g, ' ')}
                        </span>
                        <span className={styles.size}>
                          {sizeLabel(bodyBytes.byteLength, i18n.language)}
                        </span>
                        <span className={styles.time}>
                          {queued
                            ? t('breakpoints.queued').toLocaleLowerCase(i18n.language)
                            : t('capture.paused').toLocaleLowerCase(i18n.language)}
                        </span>
                      </button>
                    </div>
                  );
                }
                const frame = item.frame;
                return (
                  <div
                    key={frame.seq}
                    ref={virtualizer.measureElement}
                    data-index={virtualRow.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <FrameRow
                      frame={frame}
                      exchangeId={exchangeId}
                      startedAt={startedAt}
                      selected={frame.seq === selectedSequence}
                      onSelect={handleSelectFrame}
                    />
                    {frame.seq === selectedSequence ? (
                      <FramePayload frame={frame} exchangeId={exchangeId} />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          {loadingMore ? <div className={styles.loadingMore}>{t('capture.loadingMore')}</div> : null}
        </div>

      </div>

      {selectedPending && selectedPendingIsHead ? (
        <div className={styles.breakpointEditor}>
          <WebSocketBreakpointInspector breakpoint={selectedPending} settings={breakpoint} />
        </div>
      ) : null}

      {selectedPending && !selectedPendingIsHead ? (
        <div
          className={styles.queuedBreakpoint}
          data-automation-id={AUTOMATION_IDS.breakpoints.queuedDetail}
          data-parity="websocket-breakpoint-queued"
        >
          <span className={styles.queuedState}>
            <ListOrdered aria-hidden="true" size={12} strokeWidth={2} />
            {t('breakpoints.queued')}
          </span>
          <span className={styles.queuedPosition}>
            {t('breakpoints.queuePosition', {
              position: selectedPendingPosition,
              count: pausedBreakpoints.length,
            })}
          </span>
          <span className={styles.queuedQueue}>
            {t('breakpoints.queueName', { queue: 'WebSocket' })}
          </span>
        </div>
      ) : null}

      {pausedBreakpoints.length === 0 ? <div className={styles.note}>
        <Pause size={13} strokeWidth={1.9} />
        {breakpoint
          ? t('capture.nextMessagePauses')
          : t('capture.enableMessageBreakpoints')}
      </div> : null}
    </div>
  );
}

const FrameRow = memo(function FrameRow({
  frame,
  exchangeId,
  startedAt,
  selected,
  onSelect,
}: {
  frame: WebSocketFrameSummary;
  exchangeId: string;
  startedAt: number;
  selected: boolean;
  onSelect: (seq: number) => void;
}): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const outgoing = frame.direction === 'client-to-server';
  return (
    <button
      type="button"
      className={cx(styles.frame, selected && styles.selected)}
      onClick={() => onSelect(frame.seq)}
      data-automation-id={AutomationIdFactory.websocketFrame(exchangeId, frame.seq)}
    >
      <span className={cx(styles.direction, outgoing ? styles.outgoing : styles.incoming)}>
        <ArrowRight size={12} strokeWidth={1.9} />
      </span>
      <span className={styles.kind}>
        {frame.opcode === 1 ? t('breakpoints.replacementText') : t('capture.binary')}
      </span>
      <FramePreview frame={frame} />
      <span className={styles.size}>{sizeLabel(frame.payloadSize, i18n.language)}</span>
      <span className={styles.time}>{frameRelativeTime(startedAt, frame.timestamp, i18n.language)}</span>
    </button>
  );
});
