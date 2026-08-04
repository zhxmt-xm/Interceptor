import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowRight, Copy, Pause } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  WebSocketFrameDirection,
  WebSocketFrameSummary,
} from '../../../../shared/desktop-api';
import { BODY_PREVIEW_MAX_BYTES } from '../../../../shared/desktop-api';
import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../shared/automation-ids';
import { Count, cx, IconButton, Segmented, Switch } from '../../../components';
import { filterDirection, frameRelativeTime, sizeLabel } from '../utils';
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
}

export function WebSocketMessages({
  exchangeId,
  startedAt,
}: WebSocketMessagesProps): React.JSX.Element {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<DirectionFilter>('all');
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);
  const direction = filterDirection(filter);
  const {
    frames,
    loading,
    loadingMore,
    hasMore,
    breakpointsEnabled,
    error,
    loadMore,
    setBreakpointsEnabled,
  } =
    useWebSocketFrames(exchangeId, direction);
  const selected = frames.find((frame) => frame.seq === selectedSequence) ?? null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: frames.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  useEffect(() => {
    setSelectedSequence(null);
  }, [exchangeId, filter]);

  useEffect(() => {
    virtualizer.measure();
  }, [selectedSequence, virtualizer]);

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
        <Count>{t('capture.pauseOnMessage')}</Count>
        <Switch
          checked={breakpointsEnabled}
          onChange={setBreakpointsEnabled}
          automationId={AUTOMATION_IDS.capture.websocket.pauseOnMessage}
        />
      </div>

      <div className={styles.frameList}>
        <div className={styles.frameScroll} ref={scrollRef} onScroll={handleScroll}>
          {loading ? <div className={styles.empty}>{t('capture.loadingMessages')}</div> : null}
          {!loading && error ? (
            <div className={styles.empty}>{t('capture.failedLoadMessages', { error })}</div>
          ) : null}
          {!loading && !error && frames.length === 0 ? (
            <div className={styles.empty}>{t('capture.noWebSocketMessages')}</div>
          ) : null}
          {frames.length > 0 ? (
            <div className={styles.viewport} style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const frame = frames[virtualRow.index];
                if (!frame) {
                  return null;
                }
                return (
                  <div
                    key={frame.seq}
                    ref={virtualizer.measureElement}
                    data-index={virtualRow.index}
                    className={styles.virtualItem}
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

      <div className={styles.note}>
        <Pause size={13} strokeWidth={1.9} />
        {breakpointsEnabled
          ? t('capture.nextMessagePauses')
          : t('capture.enableMessageBreakpoints')}
      </div>
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
      <span className={styles.kind}>{frame.opcode === 1 ? t('capture.text') : t('capture.binary')}</span>
      <FramePreview frame={frame} />
      <span className={styles.size}>{sizeLabel(frame.payloadSize, i18n.language)}</span>
      <span className={styles.time}>{frameRelativeTime(startedAt, frame.timestamp, i18n.language)}</span>
    </button>
  );
});

